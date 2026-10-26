import { supabaseUrl, supabasePublishableKey } from "./supabase-config.js";

const appRoot = document.getElementById("root");
const portalRoot = document.createElement("div");
portalRoot.id = "recy-portal-root";
document.body.append(portalRoot);

const isConfigured =
  typeof supabaseUrl === "string" &&
  typeof supabasePublishableKey === "string" &&
  supabaseUrl.startsWith("https://") &&
  supabasePublishableKey.length > 10;
const feedbackQueueKey = "recy_anonymous_feedback_queue";
const adminSessionKey = "recy_admin_session";
const completionKey = "recy_onboarding_completed";
let collectionPoints = [];
let learningEntries = [];
let activeAdminTab = "points";
let mapMarkerSignature = "";

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function button(text, onClick, className = "recy-portal-button") {
  const element = node("button", className, text);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function field(labelText, control) {
  const wrapper = node("label", "recy-portal-field");
  wrapper.append(node("span", "", labelText), control);
  return wrapper;
}

function input(type, value = "", placeholder = "") {
  const element = node("input");
  element.type = type;
  element.value = value;
  element.placeholder = placeholder;
  return element;
}

function textarea(value = "", placeholder = "") {
  const element = node("textarea");
  element.value = value;
  element.placeholder = placeholder;
  return element;
}

function selectField(values, selected) {
  const element = node("select");
  for (const [value, label] of values) {
    const option = node("option", "", label);
    option.value = value;
    option.selected = value === selected;
    element.append(option);
  }
  return element;
}

function portalPage(title, subtitle = "") {
  portalRoot.replaceChildren();
  if (appRoot) {
    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");
  }
  const backdrop = node("div", "recy-portal-backdrop");
  const page = node("section", "recy-portal-page");
  const header = node("header", "recy-portal-header");
  const heading = node("div");
  heading.append(node("h1", "", title));
  if (subtitle) heading.append(node("p", "recy-portal-muted", subtitle));
  header.append(heading);
  page.append(header);
  backdrop.append(page);
  portalRoot.append(backdrop);
  return { backdrop, page, header };
}

function message(parent, text, isError = false) {
  const element = node(
    "p",
    `recy-portal-message${isError ? " recy-portal-message-error" : ""}`,
    text,
  );
  parent.prepend(element);
  return element;
}

function localUser() {
  try {
    return JSON.parse(localStorage.getItem("ecomap_user") || "null");
  } catch {
    return null;
  }
}

function onboardingDone(user) {
  try {
    const completed = JSON.parse(localStorage.getItem(completionKey) || "[]");
    return Boolean(user?.id && completed.includes(user.id));
  } catch {
    return false;
  }
}

function markOnboardingDone(user) {
  let completed = [];
  try {
    completed = JSON.parse(localStorage.getItem(completionKey) || "[]");
  } catch {
    completed = [];
  }
  if (user?.id && !completed.includes(user.id)) {
    completed.push(user.id);
    localStorage.setItem(completionKey, JSON.stringify(completed));
  }
}

function hasCompletedOnboarding(user) {
  return localStorage.getItem("ecomap_logged_in") !== "true" || onboardingDone(user);
}

async function request(path, { method = "GET", body, token } = {}) {
  if (!isConfigured) {
    throw new Error("O Supabase ainda não está configurado neste site.");
  }
  const headers = {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${token || supabasePublishableKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers.Prefer = "return=representation";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("O serviço demorou para responder. Verifique a conexão e tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }
  if (!response.ok) {
    const errorText =
      result?.message || result?.msg || result?.error_description || result?.error;
    throw new Error(errorText || `Falha na solicitação (${response.status}).`);
  }
  return result;
}

function tablePath(table, params = {}) {
  const query = new URLSearchParams(params);
  return `/rest/v1/${table}?${query.toString()}`;
}

async function loadPublicData() {
  const [points, entries] = await Promise.all([
    request(tablePath("collection_points", {
      select: "*",
      order: "point_type.asc,name.asc",
    })),
    request(tablePath("content_entries", {
      select: "*",
      published: "eq.true",
      order: "created_at.asc",
    })),
  ]);
  collectionPoints = Array.isArray(points) ? points : [];
  window.RecySoulsCollectionPoints = collectionPoints.map((point) => ({
    ...point,
    nome: point.name,
  }));
  learningEntries = Array.isArray(entries) ? entries : [];
  applySharedContent(learningEntries);
  updateMapMarkers();
}

function applySharedContent(entries) {
  const seeds = window.RecySoulsSeedContent;
  if (!seeds) return;
  const removeShared = (items) => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].__recyShared) items.splice(index, 1);
    }
  };
  removeShared(seeds.philosophy);
  removeShared(seeds.quiz);
  for (const entry of entries) {
    const philosophyTarget = entry.target_id?.startsWith("philosophy:")
      ? seeds.philosophy.find(
          (item) => String(item.id) === entry.target_id.slice("philosophy:".length),
        )
      : null;
    const quizTarget = entry.target_id?.startsWith("quiz:")
      ? seeds.quiz.find(
          (item) => String(item.id) === entry.target_id.slice("quiz:".length),
        )
      : null;
    if (philosophyTarget) {
      philosophyTarget.titulo = entry.title;
      philosophyTarget.conteudo = entry.body;
      continue;
    }
    if (quizTarget) {
      quizTarget.pergunta = entry.title;
      quizTarget.explicacao = entry.body;
      quizTarget.alternativas = Array.isArray(entry.options) ? entry.options : [];
      quizTarget.resposta_correta = Number(entry.correct_answer);
      continue;
    }
    if (entry.section === "philosophy") {
      seeds.philosophy.push({
        id: `shared-${entry.id}`,
        titulo: entry.title,
        resumo: entry.body,
        conteudo: entry.body,
        categoria: "Conteúdo da comunidade",
        tempoLeitura: "",
        fonte: "",
        __recyShared: true,
      });
    } else if (entry.section === "quiz") {
      seeds.quiz.push({
        id: `shared-${entry.id}`,
        pergunta: entry.title,
        alternativas: Array.isArray(entry.options) ? entry.options : [],
        resposta_correta: Number(entry.correct_answer),
        explicacao: entry.body,
        __recyShared: true,
      });
    }
  }
  window.dispatchEvent(new Event("recy-content-updated"));
}

async function seedBuiltInContent(session, existingEntries) {
  const seeds = window.RecySoulsSeedContent;
  if (!seeds) return;
  const existingTargets = new Set(
    existingEntries.map((entry) => entry.target_id).filter(Boolean),
  );
  const records = [
    ...seeds.philosophy.map((entry) => ({
      section: "philosophy",
      target_id: `philosophy:${entry.id}`,
      title: entry.titulo,
      body: entry.conteudo,
      options: [],
      correct_answer: null,
      published: true,
    })),
    ...seeds.quiz.map((entry) => ({
      section: "quiz",
      target_id: `quiz:${entry.id}`,
      title: entry.pergunta,
      body: entry.explicacao,
      options: entry.alternativas,
      correct_answer: entry.resposta_correta,
      published: true,
    })),
  ].filter((entry) => !existingTargets.has(entry.target_id));
  if (records.length) {
    await request("/rest/v1/content_entries", {
      method: "POST",
      body: records,
      token: session.accessToken,
    });
  }
}

async function queueFeedback(response) {
  const rows = JSON.parse(localStorage.getItem(feedbackQueueKey) || "[]");
  rows.push(response);
  localStorage.setItem(feedbackQueueKey, JSON.stringify(rows));
}

async function flushQueuedFeedback() {
  if (!isConfigured) return;
  let rows = [];
  try {
    rows = JSON.parse(localStorage.getItem(feedbackQueueKey) || "[]");
  } catch {
    localStorage.removeItem(feedbackQueueKey);
  }
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    await request("/rest/v1/survey_feedback", {
      method: "POST",
      body: rows,
    });
    localStorage.removeItem(feedbackQueueKey);
  } catch (error) {
    console.error("Não foi possível sincronizar as respostas anônimas:", error);
  }
}

function openOnboarding(user, { queued = false } = {}) {
  const { page } = portalPage(
    "Antes de entrar no RecySouls",
    `Olá, ${user.nome || "reciclador"}! Suas respostas serão anônimas e usadas apenas em totais gerais.`,
  );
  const pointsPanel = node("section", "recy-portal-card");
  pointsPanel.append(
    node("h2", "", "Pontos de coleta cadastrados"),
    node(
      "p",
      "recy-portal-muted",
      "Confira os locais disponíveis antes de responder.",
    ),
  );
  const availablePoints = collectionPoints.length
    ? collectionPoints
    : window.RecySoulsSeedContent?.collectionPoints || [];
  if (availablePoints.length) {
    const list = node("div", "recy-portal-grid");
    availablePoints.forEach((point) => {
      const card = node("article", "recy-portal-card");
      const name = point.name || point.nome || "Ponto de coleta";
      const address = point.address || point.endereco || "";
      const materials =
        point.accepted_materials || point.materiais_aceitos || [];
      card.append(
        node(
          "p",
          "recy-portal-muted",
          point.point_type === "uefs" ? "UEFS" : point.regiao || "Feira de Santana",
        ),
        node("h3", "", name),
        node("p", "", address),
        node("p", "recy-portal-muted", materials.join(", ")),
      );
      list.append(card);
    });
    pointsPanel.append(list);
  } else {
    pointsPanel.append(
      node("p", "recy-portal-muted", "Os pontos de coleta ainda não foram carregados."),
    );
  }
  page.append(pointsPanel);
  const form = node("form");
  const destination = selectField(
    [
      ["", "Selecione uma opção"],
      ["lixo_comum", "Coloco no lixo comum"],
      ["guardo", "Guardo em casa"],
      ["loja_assistencia", "Levo a uma loja ou assistência"],
      ["ecoponto", "Levo a um ponto de coleta"],
      ["outro", "Outro destino"],
    ],
    "",
  );
  destination.required = true;
  form.append(
    field("Antes do RecySouls, o que você fazia com o lixo eletrônico?", destination),
  );

  const knows = selectField(
    [
      ["", "Prefiro não responder (opcional)"],
      ["yes", "Sim, conheço"],
      ["no", "Não conheço"],
    ],
    "",
  );
  const point = input("text", "", "Nome ou endereço do ponto de coleta");
  point.maxLength = 300;
  const pointField = field(
    "Se conhece algum local de coleta em Feira de Santana, qual? (opcional)",
    point,
  );
  const privacyNote = node(
    "p",
    "recy-portal-muted",
    "Não informe seu nome, e-mail ou outros dados pessoais neste campo.",
  );
  pointField.append(privacyNote);
  form.append(field("Você conhece algum local de coleta em Feira de Santana?", knows));
  form.append(pointField);

  const actions = node("div", "recy-portal-actions");
  const submit = node("button", "recy-portal-button recy-portal-button-primary", "Continuar para o app");
  submit.type = "submit";
  const progress = node("p", "recy-portal-muted");
  if (queued) {
    progress.textContent = "A conexão com o banco está indisponível. As respostas poderão ser enviadas anonimamente mais tarde.";
  }
  actions.append(submit);
  form.append(actions, progress);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    progress.textContent = "Salvando sua resposta anônima...";
    const response = {
      previous_disposal: destination.value,
      knows_collection_point:
        knows.value === "" ? null : knows.value === "yes",
      known_point:
        knows.value === "yes" && point.value.trim()
          ? point.value.trim()
          : null,
    };
    try {
      await request("/rest/v1/survey_feedback", {
        method: "POST",
        body: response,
      });
    } catch (error) {
      console.error("A resposta anônima não foi enviada ao Supabase:", error);
      await queueFeedback(response);
      progress.textContent =
        "Sem conexão com o banco; resposta guardada anonimamente neste navegador e será enviada mais tarde.";
    }
    markOnboardingDone(user);
    localStorage.setItem("ecomap_user", JSON.stringify(user));
    localStorage.setItem("ecomap_logged_in", "true");
    location.reload();
  });
  page.append(form);
}

function currentSession() {
  try {
    return JSON.parse(sessionStorage.getItem(adminSessionKey) || "null");
  } catch {
    return null;
  }
}

async function signInAdmin(email, password) {
  const data = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!data?.access_token || !data.user?.id) {
    throw new Error("O Supabase não retornou uma sessão válida.");
  }
  const session = { accessToken: data.access_token, userId: data.user.id };
  const admins = await request(
    tablePath("app_admins", {
      select: "user_id",
      user_id: `eq.${session.userId}`,
    }),
    { token: session.accessToken },
  );
  if (!Array.isArray(admins) || admins.length === 0) {
    throw new Error("Esta conta não está autorizada como administradora.");
  }
  sessionStorage.setItem(adminSessionKey, JSON.stringify(session));
  return session;
}

async function isAdminSessionValid(session) {
  if (!session?.accessToken || !session?.userId) return false;
  const admins = await request(
    tablePath("app_admins", {
      select: "user_id",
      user_id: `eq.${session.userId}`,
    }),
    { token: session.accessToken },
  );
  return Array.isArray(admins) && admins.length > 0;
}

function openAdminLogin(errorText = "") {
  const { page } = portalPage(
    "Acesso administrativo",
    "Entre com a conta administradora autorizada.",
  );
  const form = node("form");
  const email = input("email");
  email.autocomplete = "username";
  email.required = true;
  const password = input("password", "");
  password.autocomplete = "current-password";
  password.required = true;
  const submit = node("button", "recy-portal-button recy-portal-button-primary", "Entrar no painel");
  submit.type = "submit";
  const status = node("p", "recy-portal-muted");
  form.append(field("E-mail administrativo", email), field("Senha", password), submit, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = "Verificando acesso...";
    try {
      await signInAdmin(email.value.trim(), password.value);
      await openAdmin();
    } catch (error) {
      status.textContent = error.message;
      status.className = "recy-portal-message recy-portal-message-error";
      submit.disabled = false;
    }
  });
  page.append(form);
  if (!isConfigured) {
    message(page, "Configure o projeto Supabase antes de usar o acesso administrativo.", true);
  } else if (errorText) {
    message(page, errorText, true);
  }
  page.append(
    node(
      "p",
      "recy-portal-muted",
      "O acesso é validado pelo Supabase e por uma lista de administradores no banco. Nome e e-mail, sozinhos, não concedem acesso.",
    ),
  );
  page.append(
    button("Voltar", closePortal, "recy-portal-button"),
  );
}

function closePortal() {
  portalRoot.replaceChildren();
  if (appRoot) {
    appRoot.inert = false;
    appRoot.removeAttribute("aria-hidden");
  }
}

function coordinateToPercent(point) {
  return {
    x: Math.max(8, Math.min(92, 50 + (Number(point.longitude) + 38.955) * 1400)),
    y: Math.max(8, Math.min(92, 50 - (Number(point.latitude) + 12.26) * 1400)),
  };
}

function pointFields(point = {}) {
  return {
    name: point.name || "",
    address: point.address || "",
    region: point.region || "",
    point_type: point.point_type || "uefs",
    latitude: point.latitude ?? "",
    longitude: point.longitude ?? "",
    accepted_materials: Array.isArray(point.accepted_materials)
      ? point.accepted_materials.join(", ")
      : "",
    hours: point.hours || "",
    phone: point.phone || "",
    notes: point.notes || "",
  };
}

function renderAdminMap(map, fields) {
  map.replaceChildren();
  map.append(
    node(
      "span",
      "recy-portal-map-label",
      "Clique no mapa para posicionar o ponto. A posição segue a escala do mapa de Feira.",
    ),
  );
  collectionPoints.forEach((point) => {
    const position = coordinateToPercent(point);
    const marker = node(
      "button",
      `recy-portal-marker${point.point_type === "uefs" ? " recy-portal-marker-uefs" : ""}`,
    );
    marker.type = "button";
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.title = point.name;
    marker.setAttribute("aria-label", point.name);
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      fields.latitude.value = Number(point.latitude).toFixed(6);
      fields.longitude.value = Number(point.longitude).toFixed(6);
      renderAdminMap(map, fields);
      addSelectionMarker(map, point.latitude, point.longitude);
    });
    map.append(marker);
  });
  map.onclick = (event) => {
    const rect = map.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    fields.longitude.value = (-38.955 + (x - 50) / 1400).toFixed(6);
    fields.latitude.value = (-12.26 - (y - 50) / 1400).toFixed(6);
    renderAdminMap(map, fields);
    addSelectionMarker(map, fields.latitude.value, fields.longitude.value);
  };
}

function addSelectionMarker(map, latitude, longitude) {
  const position = coordinateToPercent({ latitude, longitude });
  const marker = node("span", "recy-portal-marker recy-portal-marker-selection");
  marker.style.left = `${position.x}%`;
  marker.style.top = `${position.y}%`;
  map.append(marker);
}

function renderPointForm(container, existing = null) {
  const values = pointFields(existing || {});
  const form = node("form", "recy-portal-card");
  form.append(node("h3", "", existing ? "Editar ponto de coleta" : "Adicionar ponto de coleta"));
  const name = input("text", values.name, "Ex.: Ponto UEFS - Biblioteca Central");
  name.maxLength = 120;
  name.required = true;
  const address = input("text", values.address, "Endereço ou referência");
  address.maxLength = 240;
  address.required = true;
  const region = input("text", values.region, "Ex.: Campus UEFS");
  const type = selectField(
    [["uefs", "Ponto da UEFS"], ["feira", "Ponto de Feira de Santana"]],
    values.point_type,
  );
  const materials = textarea(values.accepted_materials, "Celulares, pilhas, computadores...");
  const lat = input("number", values.latitude);
  lat.step = "0.000001";
  lat.min = "-90";
  lat.max = "90";
  lat.required = true;
  const lon = input("number", values.longitude);
  lon.step = "0.000001";
  lon.min = "-180";
  lon.max = "180";
  lon.required = true;
  const map = node("div", "recy-portal-map");
  const hours = input("text", values.hours, "Horário de funcionamento");
  const phone = input("text", values.phone, "Telefone para contato");
  const notes = textarea(values.notes, "Informações adicionais");
  const status = node("p", "recy-portal-muted");
  const save = node(
    "button",
    "recy-portal-button recy-portal-button-primary",
    existing ? "Salvar alterações" : "Adicionar ponto",
  );
  save.type = "submit";
  form.append(
    field("Nome do ponto", name),
    field("Endereço ou referência", address),
    field("Região", region),
    field("Categoria", type),
    field("Materiais aceitos (separados por vírgulas)", materials),
    field("Latitude", lat),
    field("Longitude", lon),
    map,
    field("Horário", hours),
    field("Telefone", phone),
    field("Observações", notes),
    save,
    status,
  );
  const mapFields = { latitude: lat, longitude: lon };
  renderAdminMap(map, mapFields);
  const updatePreview = () => {
    renderAdminMap(map, mapFields);
    addSelectionMarker(map, lat.value, lon.value);
  };
  lat.addEventListener("input", updatePreview);
  lon.addEventListener("input", updatePreview);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    status.textContent = "Salvando ponto...";
    const record = {
      name: name.value.trim(),
      address: address.value.trim(),
      region: region.value.trim(),
      point_type: type.value,
      latitude: Number(lat.value),
      longitude: Number(lon.value),
      accepted_materials: materials.value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      hours: hours.value.trim(),
      phone: phone.value.trim(),
      notes: notes.value.trim(),
      updated_at: new Date().toISOString(),
    };
    try {
      await request(
        existing
          ? tablePath("collection_points", { id: `eq.${existing.id}` })
          : "/rest/v1/collection_points",
        {
          method: existing ? "PATCH" : "POST",
          body: record,
          token: currentSession()?.accessToken,
        },
      );
      await loadPublicData();
      renderAdmin();
    } catch (error) {
      status.textContent = error.message;
      status.className = "recy-portal-message recy-portal-message-error";
      save.disabled = false;
    }
  });
  container.append(form);
}

function renderPointAdmin(container) {
  const actions = node("div", "recy-portal-actions");
  const grid = node("div", "recy-portal-grid");
  const editor = node("div");
  actions.append(
    button("Adicionar ponto", () => renderPointForm(editor), "recy-portal-button recy-portal-button-primary"),
  );
  container.append(
    node(
      "p",
      "recy-portal-muted",
      "Escolha as coordenadas clicando no mapa estilizado ou preenchendo latitude e longitude. Os marcadores são exibidos no mapa do aplicativo.",
    ),
    actions,
    editor,
    grid,
  );
  for (const point of collectionPoints) {
    const card = node("article", "recy-portal-card");
    card.append(
      node("h3", "", point.name),
      node("p", "recy-portal-muted", `${point.point_type === "uefs" ? "UEFS" : "Feira"} · ${point.region || point.address}`),
      node("p", "", point.address),
      node("p", "recy-portal-muted", `${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`),
    );
    const actions = node("div", "recy-portal-actions");
    actions.append(
      button("Editar", () => {
        editor.replaceChildren();
        renderPointForm(editor, point);
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
      button("Excluir", async () => {
        if (!confirm(`Excluir o ponto "${point.name}"?`)) return;
        try {
          await request(tablePath("collection_points", { id: `eq.${point.id}` }), {
            method: "DELETE",
            token: currentSession()?.accessToken,
          });
          await loadPublicData();
          renderAdmin();
        } catch (error) {
          message(container, error.message, true);
        }
      }, "recy-portal-button recy-portal-button-danger"),
    );
    card.append(actions);
    grid.append(card);
  }
}

function renderContentForm(container, section, existing = null) {
  const form = node("form", "recy-portal-card");
  const title = input("text", existing?.title || "", "Título");
  title.maxLength = 180;
  title.required = true;
  const body = textarea(existing?.body || "", section === "quiz" ? "Pergunta ou explicação" : "Conceito e explicação");
  body.required = true;
  form.append(
    node("h3", "", section === "quiz" ? "Pergunta de aprendizado" : "Conceito de Filosofia Ambiental"),
    field("Título", title),
    field(section === "quiz" ? "Pergunta" : "Explicação", body),
  );
  let options;
  let correct;
  if (section === "quiz") {
    options = textarea(
      Array.isArray(existing?.options) ? existing.options.join("\n") : "",
      "Uma alternativa por linha",
    );
    options.required = true;
    correct = input("number", existing?.correct_answer ?? 0);
    correct.min = "0";
    correct.step = "1";
    correct.required = true;
    form.append(
      field("Alternativas (uma por linha; mínimo de duas)", options),
      field("Índice da resposta correta (começa em 0)", correct),
    );
  }
  const status = node("p", "recy-portal-muted");
  const save = node("button", "recy-portal-button recy-portal-button-primary", "Salvar conteúdo");
  save.type = "submit";
  form.append(save, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const choices = section === "quiz"
      ? options.value.split("\n").map((item) => item.trim()).filter(Boolean)
      : [];
    if (
      section === "quiz" &&
      (choices.length < 2 ||
        choices.length > 11 ||
        Number(correct.value) >= choices.length ||
        Number(correct.value) > 10)
    ) {
      status.textContent = "Informe de duas a onze alternativas e um índice correto válido.";
      status.className = "recy-portal-message recy-portal-message-error";
      return;
    }
    save.disabled = true;
    status.textContent = "Salvando conteúdo...";
    const record = {
      section,
      title: title.value.trim(),
      body: body.value.trim(),
      options: choices,
      correct_answer: section === "quiz" ? Number(correct.value) : null,
      published: true,
      updated_at: new Date().toISOString(),
    };
    try {
      await request(
        existing
          ? tablePath("content_entries", { id: `eq.${existing.id}` })
          : "/rest/v1/content_entries",
        {
          method: existing ? "PATCH" : "POST",
          body: record,
          token: currentSession()?.accessToken,
        },
      );
      await loadPublicData();
      renderAdmin();
    } catch (error) {
      status.textContent = error.message;
      status.className = "recy-portal-message recy-portal-message-error";
      save.disabled = false;
    }
  });
  container.append(form);
}

function renderContentAdmin(container) {
  const actions = node("div", "recy-portal-actions");
  const editor = node("div");
  const grid = node("div", "recy-portal-grid");
  actions.append(
    button("Adicionar conceito", () => renderContentForm(editor, "philosophy")),
    button("Adicionar pergunta", () => renderContentForm(editor, "quiz")),
  );
  container.append(
    node("p", "recy-portal-muted", "Conceitos publicados aparecem em Filosofia Ambiental; perguntas aparecem no Julgamento do Pergaminho."),
    actions,
    editor,
    grid,
  );
  for (const entry of learningEntries) {
    const card = node("article", "recy-portal-card");
    card.append(
      node("p", "recy-portal-muted", entry.section === "quiz" ? "Julgamento do Pergaminho" : "Filosofia Ambiental"),
      node("h3", "", entry.title),
      node("p", "", entry.body),
    );
    const actions = node("div", "recy-portal-actions");
    actions.append(
      button("Editar", () => {
        editor.replaceChildren();
        renderContentForm(editor, entry.section, entry);
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
    if (!entry.target_id) {
      actions.append(
        button("Excluir", async () => {
          if (!confirm(`Excluir "${entry.title}"?`)) return;
          try {
            await request(tablePath("content_entries", { id: `eq.${entry.id}` }), {
              method: "DELETE",
              token: currentSession()?.accessToken,
            });
            await loadPublicData();
            renderAdmin();
          } catch (error) {
            message(container, error.message, true);
          }
        }, "recy-portal-button recy-portal-button-danger"),
      );
    }
    card.append(actions);
    grid.append(card);
  }
}

async function renderFeedbackAdmin(container) {
  container.append(
    node(
      "p",
      "recy-portal-muted",
      "As respostas não incluem nome, e-mail, conta ou coordenadas. Esta tela apresenta apenas agrupamentos e totais.",
    ),
  );
  const summary = node("div", "recy-portal-grid");
  container.append(summary);
  try {
    const rows = await request(tablePath("admin_feedback_summary", {
      select: "previous_disposal,knows_collection_point,known_point,response_count",
      order: "response_count.desc",
    }), { token: currentSession()?.accessToken });
    if (!Array.isArray(rows) || rows.length === 0) {
      summary.append(node("p", "recy-portal-muted", "Ainda não há respostas."));
      return;
    }
    const grouped = new Map();
    for (const row of rows) {
      const key = JSON.stringify([
        row.previous_disposal,
        row.knows_collection_point,
        row.known_point,
      ]);
      const current = grouped.get(key) || { ...row, response_count: 0 };
      current.response_count += Number(row.response_count) || 0;
      grouped.set(key, current);
    }
    const totals = new Map();
    let total = 0;
    for (const row of grouped.values()) {
      total += row.response_count;
      totals.set(row.previous_disposal, (totals.get(row.previous_disposal) || 0) + row.response_count);
    }
    const destinationLabels = {
      lixo_comum: "Lixo comum",
      guardo: "Guarda em casa",
      loja_assistencia: "Loja ou assistência",
      ecoponto: "Ponto de coleta",
      outro: "Outro destino",
    };
    const totalCard = node("article", "recy-portal-card");
    totalCard.append(node("h3", "", "Respostas recebidas"), node("p", "", String(total)));
    summary.append(totalCard);
    for (const [destination, count] of totals) {
      const card = node("article", "recy-portal-card");
      card.append(
        node("h3", "", destinationLabels[destination] || destination),
        node("p", "", `${count} resposta(s)`),
      );
      summary.append(card);
    }
    const suggestions = new Map();
    for (const row of grouped.values()) {
      if (row.known_point) {
        suggestions.set(
          row.known_point,
          (suggestions.get(row.known_point) || 0) + row.response_count,
        );
      }
    }
    if (suggestions.size) {
      const card = node("article", "recy-portal-card");
      card.append(node("h3", "", "Locais mencionados (agrupados)"));
      for (const [point, count] of suggestions) {
        card.append(node("p", "", `${point} — ${count} menção(ões)`));
      }
      summary.append(card);
    }
  } catch (error) {
    message(container, error.message, true);
  }
}

function renderAdmin() {
  const { page, header } = portalPage(
    "Administração do RecySouls",
    "Gerencie pontos do mapa e conteúdo educativo. Os dados pessoais dos usuários não são exibidos aqui.",
  );
  header.append(
    button("Sair do painel", () => {
      sessionStorage.removeItem(adminSessionKey);
      openAdminLogin();
    }),
    button("Voltar ao app", closePortal),
  );
  const tabs = node("div", "recy-portal-tabs");
  const content = node("section");
  const tabDefinitions = [
    ["points", "Pontos e mapa"],
    ["content", "Filosofia e Pergaminhos"],
    ["feedback", "Respostas gerais"],
  ];
  for (const [key, label] of tabDefinitions) {
    tabs.append(
      button(label, () => {
        activeAdminTab = key;
        renderAdmin();
      }),
    );
  }
  page.append(tabs, content);
  if (activeAdminTab === "points") renderPointAdmin(content);
  else if (activeAdminTab === "content") renderContentAdmin(content);
  else renderFeedbackAdmin(content);
}

async function openAdmin() {
  const session = currentSession();
  try {
    if (!(await isAdminSessionValid(session))) {
      sessionStorage.removeItem(adminSessionKey);
      openAdminLogin("A sessão não possui permissão administrativa.");
      return;
    }
    const [points, entries] = await Promise.all([
      request(tablePath("collection_points", {
        select: "*",
        order: "point_type.asc,name.asc",
      }), { token: session.accessToken }),
      request(tablePath("content_entries", {
        select: "*",
        order: "created_at.asc",
      }), { token: session.accessToken }),
    ]);
    collectionPoints = Array.isArray(points) ? points : [];
    await seedBuiltInContent(session, Array.isArray(entries) ? entries : []);
    const refreshedEntries = await request(tablePath("content_entries", {
      select: "*",
      order: "created_at.asc",
    }), { token: session.accessToken });
    learningEntries = Array.isArray(refreshedEntries) ? refreshedEntries : [];
    applySharedContent(learningEntries);
    renderAdmin();
  } catch (error) {
    openAdminLogin(error.message);
  }
}

async function openUefsPoints() {
  let loadError = "";
  try {
    await loadPublicData();
  } catch (error) {
    console.error("Não foi possível carregar os pontos da UEFS:", error);
    loadError = error.message;
  }
  const { page } = portalPage(
    "Pontos da UEFS",
    "Locais de coleta cadastrados no campus. Os marcadores verdes mostram pontos da UEFS no mapa.",
  );
  const actions = node("div", "recy-portal-actions");
  actions.append(button("Voltar ao app", closePortal));
  const map = node("div", "recy-portal-map");
  map.style.cursor = "default";
  const list = node("div", "recy-portal-grid");
  page.append(
    actions,
    node(
      "p",
      "recy-portal-muted",
      "Os pontos do campus serão publicados pelos administradores. Nenhum local será inventado ou presumido.",
    ),
    map,
    list,
  );
  if (loadError) {
    message(list, `Não foi possível carregar os pontos compartilhados: ${loadError}`, true);
    return;
  }
  try {
    collectionPoints
      .filter((point) => point.point_type === "uefs")
      .forEach((point) => {
        const position = coordinateToPercent(point);
        const marker = node("span", "recy-portal-marker recy-portal-marker-uefs");
        marker.style.left = `${position.x}%`;
        marker.style.top = `${position.y}%`;
        marker.title = point.name;
        map.append(marker);
        const card = node("article", "recy-portal-card");
        card.append(
          node("h3", "", point.name),
          node("p", "", point.address),
          node("p", "recy-portal-muted", point.accepted_materials?.join(", ") || "Materiais não informados"),
          node("p", "recy-portal-muted", point.hours || ""),
        );
        list.append(card);
      });
    if (!list.childElementCount) {
      list.append(
        node(
          "p",
          "recy-portal-message",
          "Ainda não há pontos da UEFS cadastrados. Os administradores poderão adicioná-los pelo painel.",
        ),
      );
    }
  } catch (error) {
    message(page, error.message, true);
  }
}

function openPointDetails(point) {
  const { page } = portalPage(point.name, point.address);
  const actions = node("div", "recy-portal-actions");
  actions.append(button("Voltar ao app", closePortal));
  const details = node("article", "recy-portal-card");
  details.append(
    node("p", "", point.point_type === "uefs" ? "Ponto de coleta UEFS" : "Ponto de coleta em Feira de Santana"),
    node("p", "", point.accepted_materials?.join(", ") || "Materiais não informados"),
    node("p", "recy-portal-muted", point.hours || ""),
    node("p", "recy-portal-muted", point.phone || ""),
  );
  page.append(actions, details);
}

function updateMapMarkers() {
  const map = document.querySelector("#map-tab .map-container");
  if (!map) return;
  const signature = JSON.stringify(
    collectionPoints.map((point) => [
      point.id,
      point.name,
      point.point_type,
      point.latitude,
      point.longitude,
    ]),
  );
  if (signature === mapMarkerSignature && map.querySelector(".recy-portal-map-layer")) return;
  mapMarkerSignature = signature;
  let layer = map.querySelector(".recy-portal-map-layer");
  if (!layer) {
    layer = node("div", "recy-portal-map-layer");
    layer.style.cssText = "position:absolute;inset:0;z-index:4;pointer-events:none";
    map.append(layer);
  }
  layer.replaceChildren();
  map.querySelectorAll(".marker[title]").forEach((marker) => {
    marker.style.display = collectionPoints.length ? "none" : "";
  });
  collectionPoints.forEach((point) => {
    const position = coordinateToPercent(point);
    const marker = node(
      "button",
      `recy-portal-marker${point.point_type === "uefs" ? " recy-portal-marker-uefs" : ""}`,
    );
    marker.type = "button";
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.style.pointerEvents = "auto";
    marker.title = point.name;
    marker.setAttribute("aria-label", point.name);
    marker.addEventListener("click", () => openPointDetails(point));
    layer.append(marker);
  });
}

function installNavigationButtons() {
  const nav = document.querySelector("#mainsystem-tabs");
  if (!nav) return;
  nav.querySelector("#recy-admin-nav")?.remove();
  if (!nav.querySelector("#recy-uefs-nav")) {
    const uefs = button("Pontos da UEFS", openUefsPoints, "recy-portal-nav-button w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all");
    uefs.id = "recy-uefs-nav";
    nav.append(uefs);
  }
  document.getElementById("recy-admin-login")?.remove();
}

function createAppUser(name, email) {
  const existing = localUser();
  const isGuest = name === "Convidado";
  if (!isGuest && existing?.email?.toLowerCase() === email.toLowerCase()) {
    return { ...existing, nome: name, email };
  }
  let id = existing?.nome === "Convidado" ? existing.id : null;
  if (isGuest && !id) {
    id = localStorage.getItem("recy_guest_user_id");
    if (!id) {
      id = `user-${crypto.randomUUID()}`;
      localStorage.setItem("recy_guest_user_id", id);
    }
  }
  if (!id) id = `user-${crypto.randomUUID()}`;
  return {
    id,
    nome: name,
    email: email || "",
    pontuacao: existing?.pontuacao || 0,
  };
}

function onLoginSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || portalRoot.contains(form)) return;
  const nameInput = form.querySelector('input[type="text"]');
  const emailInput = form.querySelector('input[type="email"]');
  if (!nameInput || !emailInput) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (!name || !email) {
    nameInput.reportValidity();
    emailInput.reportValidity();
    return;
  }
  const user = createAppUser(name, email);
  if (onboardingDone(user)) {
    localStorage.setItem("ecomap_user", JSON.stringify(user));
    localStorage.setItem("ecomap_logged_in", "true");
    location.reload();
    return;
  }
  openOnboarding(user);
}

function onGuestClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const guestButton = target?.closest("button");
  if (!guestButton || guestButton.textContent.trim() !== "Convidado") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openOnboarding(createAppUser("Convidado", ""));
}

document.addEventListener("submit", onLoginSubmit, true);
document.addEventListener("click", onGuestClick, true);

const appObserver = new MutationObserver(() => {
  installNavigationButtons();
  updateMapMarkers();
});
if (appRoot) appObserver.observe(appRoot, { childList: true, subtree: true });

void flushQueuedFeedback();
void loadPublicData().catch((error) => {
  console.error("Não foi possível carregar conteúdo compartilhado:", error);
});

if (
  localStorage.getItem("ecomap_logged_in") === "true" &&
  !hasCompletedOnboarding(localUser())
) {
  openOnboarding(localUser() || { id: "user-guest", nome: "Convidado" }, {
    queued: !isConfigured,
  });
}