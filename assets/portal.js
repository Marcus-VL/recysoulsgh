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
const adminSessionKey = "recy_admin_session";
const exampleUefsPointId = "00000000-0000-4000-8000-000000000003";
const defaultMaterialCategories = [
  "Celulares / Tablets",
  "Pilhas / Baterias",
  "Computadores / Notebooks",
  "Monitores / TVs",
  "Impressoras / Scanners",
];
let collectionPoints = [];
let learningEntries = [];
let activeAdminTab = "points";

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

async function request(
  path,
  { method = "GET", body, token, returnRepresentation = true } = {},
) {
  if (!isConfigured) {
    throw new Error("O Supabase ainda não está configurado neste site.");
  }
  const headers = {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${token || supabasePublishableKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    headers.Prefer = returnRepresentation ? "return=representation" : "return=minimal";
  }
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
  collectionPoints = Array.isArray(points)
    ? points.filter((point) => point.id !== exampleUefsPointId)
    : [];
  window.RecySoulsCollectionPoints = collectionPoints.map((point) => ({
    ...point,
    nome: point.name,
    endereco: point.address,
    regiao: point.region || (point.point_type === "uefs" ? "UEFS" : "Feira de Santana"),
    materiais_aceitos: point.accepted_materials || [],
    horario: point.hours,
    telefone: point.phone,
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

function openAdminLogin(errorText = "", emailValue = "") {
  const { page } = portalPage(
    "Acesso administrativo",
    "Entre com a conta administradora autorizada.",
  );
  const form = node("form");
  const email = input("email", emailValue);
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
      await openAdmin(email.value.trim());
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
  installAuthScreen();
}

function coordinateToPercent(point) {
  return {
    x: Math.max(8, Math.min(92, 50 + (Number(point.longitude) + 38.955) * 1400)),
    y: Math.max(8, Math.min(92, 50 - (Number(point.latitude) + 12.26) * 1400)),
  };
}

function buildUefsCampusDrawing() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 1000 600");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");

  const add = (tag, attributes, text, parent = svg) => {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) =>
      element.setAttribute(name, value),
    );
    if (text) element.textContent = text;
    parent.append(element);
    return element;
  };
  const road = (path, kind) => {
    const isMainRoad = kind === "tertiary";
    const width = isMainRoad ? 17 : 7;
    add("path", {
      d: path,
      fill: "none",
      stroke: isMainRoad ? "#59452f" : "#483923",
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    add("path", {
      d: path,
      fill: "none",
      stroke: "#d4a35955",
      "stroke-width": isMainRoad ? 1.5 : 1,
      "stroke-dasharray": "3 9",
      "stroke-linecap": "round",
    });
  };
  const roads = [
    ["tertiary", "M183.2 538.4 188.1 551.3 192.8 559.3 201.2 570.1 213.4 577.4 224.5 581.7 234.1 583 248.3 581 450.8 520.2 474.4 513.8 519 500.5 556.9 489.3 594.6 478.1 631.9 466.9 654.3 460.2 664.2 456.3 692.2 447.7 712.9 441.3 740.3 432.9 765.4 425.2 792.3 417 835.6 403.7 853.4 398.2 874.2 391.8 958.6 366 943.8 322.1 940.6 313.3"],
    ["tertiary", "M183.2 538.4 221.1 529.7 251.4 520.7 266.3 516.2 383.5 481.1 489.7 449.3 504.3 444.9 624.9 408.7 732.3 376.5 748.2 371.7 866.6 336.2 921.9 319.4 933.7 315.5 940.6 313.3 961.1 306.9 1038.2 283.1 1075.4 271.7 1140.4 251.5"],
    ["tertiary", "M106.8 559.9 162.3 544.5 183.2 538.4"],
    ["service", "M14.3 389.6 21.4 387.6 74.2 373.1 99.4 365 128.8 356.5 197.8 336.5 247.3 321 275.2 312.2 319.9 298 373.2 281 456 256.4 502.9 243 560.6 224.4 614.5 207.9 632.7 202.3 638.1 200.6 741.1 167.4 757.7 162 830.3 140.3 861.1 130.7"],
    ["service", "M14.3 389.6 -21 288.5 -18 269.3 -11.9 248.4 -4.3 231.3 11.9 212.1 34.2 197.6 57.2 190.1 179.2 150.8 214.4 140.1 282.7 119.4 318.2 108.5 350.4 98.9 445.1 69.5 509.4 52.3 578.1 33.9 686.3 1.9"],
    ["service", "M519 500.5 520.1 503.7 529.4 528.2 538.9 553.1 542.6 562.7 546 569.2 549.9 573.3 554.7 576.6 605.5 601.6 614.2 604.1 624.6 605.5 637.5 604.4 709.2 585.5"],
    ["service", "M853.4 398.2 878.7 463.1 896.2 457.7 907.5 467.4 907.6 483 896.6 500.6 896.5 544.6 903.6 550.2 923.6 510.3 921 486.3 915.1 466.9 896.1 446.1 874.2 391.8"],
    ["service", "M348.8 230.9 346.2 228.8 332.6 217.2 322.2 207.6 313.7 195.6 308.5 190.6 303.8 189.2 297.9 189.6 292.9 191.2 287.3 193.7 285.2 197.7 282.8 202.5 284 209.6 287.3 219.4 293.7 233.2 299.4 240.6 303.6 242.5 309.1 242 331.3 236.5 348.8 230.9"],
    ["service", "M1204.5 -157 1209.9 -159.6 1211.2 -165.1 1210.7 -168.9 1208.5 -171.9 1203.6 -173.6 1196.2 -170.8 993.8 -106.5 976.6 -101 965.4 -97.4 946.3 -91.2 804.7 -45 713.5 -17.9 697.1 -13 682.3 -8.6 555.9 26.5 505.6 41.1 441.7 59.6 314.5 98.5 210.8 130.2 52.9 178.4 31.7 184.9 11 195.5 -7.3 211.8 -18.9 229.8 -27.5 255.3 -32.6 275.3 -32.3 294.8 5.4 401.2 58.7 551.5 63.4 564.7 72.7 580.8"],
  ];

  add("rect", { width: 1000, height: 600, fill: "#17110b" });
  for (let x = 0; x <= 1000; x += 50) {
    add("path", {
      d: `M${x} 0v600`,
      fill: "none",
      stroke: x % 100 === 0 ? "#d4a35918" : "#ffffff0b",
      "stroke-width": x % 100 === 0 ? 1.2 : 0.7,
    });
  }
  for (let y = 0; y <= 600; y += 50) {
    add("path", {
      d: `M0 ${y}h1000`,
      fill: "none",
      stroke: y % 100 === 0 ? "#d4a35918" : "#ffffff0b",
      "stroke-width": y % 100 === 0 ? 1.2 : 0.7,
    });
  }
  roads.forEach(([kind, path]) => road(path, kind));

  const moduleAreas = [
    ["Módulo 1", "M747 148 866 135 901 282 858 315 760 305Z", 788, 157, 826, 237],
    ["Módulo 2", "M626 184 752 169 783 323 739 354 642 342Z", 652, 193, 708, 274],
    ["Módulo 3", "M504 216 630 202 662 367 622 391 520 374Z", 529, 225, 588, 310],
    ["Módulo 4", "M384 251 507 239 540 407 502 430 396 413Z", 409, 261, 466, 348],
    ["Módulo 5", "M264 287 387 274 419 442 382 462 278 448Z", 289, 297, 346, 383],
    ["Módulo 6", "M158 376 292 362 301 486 257 501 169 443Z", 183, 386, 235, 434],
    ["Módulo 7", "M27 365 153 351 184 512 146 537 42 490Z", 52, 375, 90, 451],
  ];
  moduleAreas.forEach(([label, path, x, y, centerX, centerY]) => {
    const isModuleThree = label === "Módulo 3";
    const insetArea = document.createElementNS(namespace, "g");
    insetArea.setAttribute(
      "transform",
      `translate(${centerX} ${centerY}) rotate(-8) scale(0.97) translate(${-centerX} ${-centerY})`,
    );
    add("path", {
      d: path,
      fill: isModuleThree ? "#3bce7d0b" : "#d4a35908",
      stroke: isModuleThree ? "#8af0b288" : "#d4a35970",
      "stroke-width": isModuleThree ? 2 : 1.5,
      "stroke-dasharray": "7 5",
      "stroke-linejoin": "round",
    }, undefined, insetArea);
    svg.append(insetArea);
    add(
      "text",
      {
        x,
        y,
        fill: isModuleThree ? "#b8ffd0" : "#d4a359",
        "font-size": "11",
        "font-family": "sans-serif",
        "font-weight": "700",
        "paint-order": "stroke",
        stroke: "#17100b",
        "stroke-width": "3",
        "stroke-linejoin": "round",
      },
      label.toUpperCase(),
    );
  });

  const footprints = [
    ["Adm. 1", "M882.8 297 875.7 273.8 847.4 281.5 851.2 292.5 855.3 304.4Z", 865.9, 291],
    ["Adm. 2", "M755.8 307.3 726.7 315.3 735.5 340.8 763.8 333Z", 747.5, 320.7],
    ["PATS 3", "M613.4 230.1 569.3 243 518.1 257.9 522.9 271.8 574.6 256.7 617.8 244Z", 575.7, 247.7],
    ["PATS 4", "M492.6 266.2 464.2 274.4 398.5 293.3 402.7 306.1 452.9 291.7 496.8 279Z", 457.2, 282.4],
    ["Adm. 5", "M395 417 364.3 425 372.5 449.2 402.2 441.4Z", 385.8, 429.9],
    ["Adm. 6", "M274.7 454.4 246.8 463.5 255.2 486.1 282.8 477.3Z", 266.8, 467.1],
    ["Adm. 7", "M159.3 491.5 129.7 500.8 137.7 522 167.5 513Z", 150.7, 503.8],
    ["LABOTEC 3", "M530.5 79.2 517.8 83.3 515.6 77.3 512.3 78.4 514.2 83.7 512.4 84.3 510.8 84.8 509.1 79.8 505.8 80.9 507.5 86.3 496.2 89.7 488.4 68.7 500.4 64.8 501.2 67 511.1 63.8 511.1 61.5 522.6 57.8Z", 511, 76.1],
    ["LABOTEC 1", "M589.8 162.4 579 165.7 580.4 169.6 564.9 174.3 563.5 170.4 549.1 174.8 550.5 178.6 547.1 179.6 538.6 182.2 537.3 178.3 521.3 183.2 522.5 186.5 508.9 190.7 507.6 186.7 495.3 190.5 502.2 210.6 544.3 197.8 543.7 196.2 547.7 194.9 552.5 193.5 553.1 195.4 596.6 182.2Z", 547.2, 182.9],
    ["LABOTEC 2", "M474.1 124.2 517.6 111 518.5 113.5 522.3 112.4 527.6 110.8 526.7 108.2 569.1 95.3 576.7 117.4 564.5 121.1 563.3 117.5 550.2 121.4 551.4 124.8 534.8 129.8 533.4 125.7 529.1 127 530.3 130.5 528.6 131.1 527 131.6 525.6 127.6 520 129.3 521.3 133 507.6 137.1 506.5 133.8 491.4 138.4 492.6 142 481.4 145.5Z", 524.6, 124.6],
    ["Auditório", "M924.3 441.6 941.8 497 982.1 485.7 964 429.7 952.2 434.1 948.9 426.5 932.3 431.6 934 438.3Z", 944.9, 447.4],
    ["Biblioteca", "M462.7 560.7 470.5 585.2 465.2 586.7 469.3 599.6 481.5 596.1 490.9 625.5 522.9 616.5 521.7 612.7 541.9 607 532.5 577.3 528.6 578.4 526.1 570.5 535.3 567.9 533.8 563.3 523.4 566.2 516.2 543.6 499.7 548.3 497.5 541.3 484.4 545 479.9 546.3 482.7 555Z", 501.3, 575.2],
    ["Reitoria", "M574.4 573.7 585.9 552.8 609.8 564.4 612.9 560.7 615.8 558.2 619.3 555.8 623 554.3 627 553.8 630.8 553.8 635.4 554.2 640 554.8 650.8 532.2 675.6 543.7 651.5 584.4 643.8 580.4 638.1 591.2 624.2 585.1 617.7 594.5 591.8 581.4Z", 622.1, 565.2],
    ["Restaurante", "M760.1 557.4 781.9 567.4 804.6 524.3 782.8 514.2Z", 777.9, 544.1],
    ["MP. 3", "M536.8 296.1 543.8 317.3 590 303.8 585.9 291.1 583.1 282.6Z", 562.7, 297.8],
    ["MT. 3", "M595.9 321.6 602.7 342.5 645.2 329.3 641.4 318.3 638.2 308.9Z", 619.9, 323.7],
    ["Adm. 3", "M614.7 378.2 645 369.2 637 345.3 606.7 354.3Z", 623.6, 365.1],
    ["MT. 2", "M723.2 305.4 766.1 293.1 762.4 282.1 758.7 271.3 715.8 284Z", 741.5, 290.2],
    ["MP. 2", "M657.8 259 664.8 280.7 710.1 267.7 702.6 246.2Z", 678.6, 262.5],
    ["PATS 2", "M639.4 221.5 644.1 235.6 693.9 221.2 739.2 208.2 734.6 194.1Z", 681.8, 217],
    ["MT. 1", "M836.1 248.7 843.4 270 886.7 258.2 879.7 236.5Z", 856.4, 252.4],
    ["MP. 1", "M778.5 223.4 785.5 244.8 830.4 231.9 823 210.6Z", 799.2, 226.8],
    ["PATS 1", "M760.4 184.7 765.2 199.4 814.3 185.2 859.8 172.1 855 157.4Z", 802.5, 180.6],
    ["MT. 7", "M125.5 465.3 132.7 485.4 166.8 474.6 162.8 463.5 159.6 454.5Z", 145.5, 468.1],
    ["MP. 7", "M58.5 441.4 66.1 462.8 105.7 450.4 100.2 434.8 98.2 429.1Z", 81.2, 443.3],
    ["PATS 7", "M42.1 407.9 46.6 420.4 93.2 405.7 138.8 391.3 134.3 378.7Z", 82.9, 402],
    ["MT. 5", "M353.6 393.2 360.5 413.6 403.1 401.6 399.6 390.6 396.5 381.1Z", 377.8, 395.6],
    ["MP. 5", "M294.3 368.3 301.6 391.8 348.7 378.9 340.8 355.5Z", 315.9, 372.6],
    ["PATS 5", "M277.5 332.1 282.3 345.5 332.1 330 376.5 316.1 371.7 302.6 325.5 317.1Z", 320.5, 325],
    ["MP. 4", "M417.1 332.1 424 352.6 468.9 339.3 464.8 327 462 318.7Z", 442.3, 333.6],
    ["MT. 4", "M475.1 357.8 516.8 345.4 519.7 354.1 523.2 365.1 481.5 376.7Z", 498.6, 359.5],
    ["Adm. 4", "M486.1 390.5 489.8 401.4 493.6 412.7 494 413.8 523.8 405.3 516.3 381.9Z", 498.5, 399.4],
    ["LABOFIS", "M380.1 226.6 387.1 246.3 471.3 220.1 464.5 201 456.7 203.5 458.1 207.5 445.3 211.5 443.7 206.9 428.3 211.7 429.7 215.6 420.3 218.5 418.9 214.5 403.2 219.4 404.6 223.3 392.5 227.1 391.1 223.2Z", 422.1, 217.8],
    ["LABEXA", "M355.6 257.3 348.1 236.6 337.6 239.9 339.1 244.2 325.6 248.5 324.2 244.6 306.7 250.2 307.8 253.3 298.9 256.1 297.6 252.6 280 258.2 281.2 261.7 268.2 265.8 266.5 261.1 253.5 265.3 261.4 287.3Z", 306.3, 255.3],
    ["Museu", "M984.6 159.2 986.5 164.9 982.3 166.2 985.9 176.2 990 175 991.3 178.6 1015.9 171 1016.9 173.6 1018.8 174.3 1023.9 172.8 1019.5 160.1 1022.5 159.2 1018.8 148.7Z", 1003, 167.1],
    ["MT. 6", "M234.7 431.1 275.4 416.5 279.3 427.1 283.3 438 241.9 450.5Z", 258.2, 432.4],
    ["MP. 6", "M172.6 405.5 181.6 428.8 227.5 412.9 218.8 389.9Z", 194.6, 408.5],
    ["Lab Letras", "M622.6 151.1 634.7 147.5 635.9 151.3 648 147.7 646.7 143.9 692 130.5 694.2 133.3 706.1 129.7 704.4 124.8 718 120.7 725.9 143.9 684.4 156.2 683.4 153.1 670.6 156.9 671.4 159.6 629.6 171.9Z", 670, 145.5],
    ["CAU II", "M801.7 480.6 823.3 489.6 804.6 524.3 782.8 514.2Z", 802.8, 497.9],
    ["CAU III", "M794.6 455.1 862.2 435 869.7 456.9 802.1 477.1Z", 824.6, 455.9],
    ["CAU I", "M697.9 518.8 758.5 499.6 767.7 525.3 707.1 544.5Z", 725.8, 521.4],
    ["PAV NOVO", "M190 72 270 49 284 96 204 119Z", 237, 89],
  ];
  footprints.forEach(([label, path, x, y]) => {
    const isModuleThree = /^(Adm\.|MT\.|MP\.|PATS) 3$/.test(label);
    const isLab = /^(LABOTEC|LABOFIS|LABEXA|Lab Letras)/.test(label);
    const fill = isModuleThree
      ? "#193b2d"
      : isLab
        ? "#263226"
        : "#302619";
    const stroke = isModuleThree
      ? "#8af0b2"
      : isLab
        ? "#9ab77e"
        : "#c99a52";
    add("path", {
      d: `${path} Z`,
      fill,
      stroke,
      "stroke-width": isModuleThree ? 2.5 : 1.7,
      "stroke-linejoin": "round",
    });
    add(
      "text",
      {
        x,
        y: y + 2.5,
        fill: isModuleThree ? "#b8ffd0" : "#f0d7aa",
        "font-size": "9",
        "font-family": "sans-serif",
        "font-weight": "600",
        "text-anchor": "middle",
        "paint-order": "stroke",
        stroke: "#17100b",
        "stroke-width": "2.5",
        "stroke-linejoin": "round",
      },
      label,
    );
  });

  add(
    "text",
    {
      x: 18,
      y: 24,
      fill: "#ebd7c399",
      "font-size": "12",
      "font-family": "sans-serif",
      "font-weight": "700",
    },
    "N ↑",
  );
  return svg;
}

function uefsPointToPercent(point) {
  return {
    x: Math.max(2, Math.min(98, (Number(point.longitude) + 38.976) / 0.008 * 100)),
    y: Math.max(2, Math.min(98, (-12.1975 - Number(point.latitude)) / 0.005 * 100)),
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

function materialCategories(existingMaterials = []) {
  return Array.from(
    new Set([
      ...defaultMaterialCategories,
      ...collectionPoints.flatMap((point) => point.accepted_materials || []),
      ...existingMaterials,
    ].map((material) => material.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function renderAdminMap(map, fields) {
  map.replaceChildren();
  const isUefsMap = fields.pointType?.value === "uefs";
  map.className = isUefsMap
    ? "recy-portal-map recy-uefs-campus-map recy-uefs-admin-map"
    : "recy-portal-map";
  map.append(
    node(
      "span",
      "recy-portal-map-label",
      isUefsMap
        ? "Clique no campus para posicionar o ponto UEFS."
        : "Clique no mapa para posicionar o ponto.",
    ),
  );
  if (isUefsMap) {
    const mapContent = node("div", "recy-uefs-map-content");
    mapContent.append(buildUefsCampusDrawing());
    map.append(mapContent);
    collectionPoints
      .filter(
        (point) =>
          point.point_type === "uefs" &&
          Number.isFinite(Number(point.latitude)) &&
          Number.isFinite(Number(point.longitude)),
      )
      .forEach((point) => {
        const position = uefsPointToPercent(point);
        const marker = node("button", "recy-portal-marker recy-portal-marker-uefs");
        marker.type = "button";
        marker.style.left = `${position.x}%`;
        marker.style.top = `${position.y}%`;
        marker.title = point.name;
        marker.setAttribute("aria-label", `Selecionar ${point.name}`);
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          fields.latitude.value = Number(point.latitude).toFixed(6);
          fields.longitude.value = Number(point.longitude).toFixed(6);
          renderAdminMap(map, fields);
          addSelectionMarker(map, point.latitude, point.longitude);
        });
        mapContent.append(marker);
      });
    map.onclick = (event) => {
      const svg = map.querySelector(".recy-uefs-map-content > svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      fields.longitude.value = (-38.976 + x * 0.008).toFixed(6);
      fields.latitude.value = (-12.1975 - y * 0.005).toFixed(6);
      renderAdminMap(map, fields);
      addSelectionMarker(map, fields.latitude.value, fields.longitude.value);
    };
    return;
  }

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
  const isUefsMap = map.classList.contains("recy-uefs-admin-map");
  const position = isUefsMap
    ? uefsPointToPercent({ latitude, longitude })
    : coordinateToPercent({ latitude, longitude });
  const marker = node("span", "recy-portal-marker recy-portal-marker-selection");
  marker.style.left = `${position.x}%`;
  marker.style.top = `${position.y}%`;
  const markerLayer = isUefsMap
    ? map.querySelector(".recy-uefs-map-content")
    : map;
  markerLayer?.append(marker);
}

function renderPointForm(container, existing = null, initialType = "uefs") {
  const values = pointFields(existing || { point_type: initialType });
  const form = node("form", "recy-portal-card");
  form.append(node("h3", "", existing ? "Editar ponto de coleta" : "Adicionar ponto de coleta"));
  const name = input("text", values.name, "Ex.: MP.4 - Laboratório de Eletrônica");
  name.maxLength = 120;
  name.required = true;
  const address = input(
    "text",
    values.address || (values.point_type === "uefs" ? "Campus UEFS" : ""),
    "Endereço ou referência",
  );
  address.maxLength = 240;
  address.required = true;
  const region = input("text", values.region, "Ex.: Campus UEFS");
  const type = selectField(
    [["uefs", "Ponto da UEFS"], ["feira", "Ponto de Feira de Santana"]],
    values.point_type,
  );
  const selectedMaterials = new Set(
    values.accepted_materials.split(",").map((material) => material.trim()).filter(Boolean),
  );
  const formCategories = new Set(
    values.accepted_materials.split(",").map((material) => material.trim()).filter(Boolean),
  );
  const materialOptions = node("div", "recy-material-options");
  const categoryControls = node("div", "recy-material-category-controls");
  const addCategory = button(
    "+ Adicionar categoria",
    () => {
      categoryInput.hidden = !categoryInput.hidden;
      addCategoryButton.hidden = categoryInput.hidden;
      if (!categoryInput.hidden) categoryInput.focus();
    },
  );
  const categoryInput = input("text", "", "Ex.: Eletrodomésticos");
  categoryInput.hidden = true;
  categoryInput.maxLength = 80;
  const addCategoryButton = button("Adicionar", () => {
    const category = categoryInput.value.trim();
    if (!category) {
      categoryInput.focus();
      return;
    }
    const existing = Array.from(materialOptions.querySelectorAll('input[type="checkbox"]')).find(
      (checkbox) => checkbox.value.toLocaleLowerCase("pt-BR") === category.toLocaleLowerCase("pt-BR"),
    );
    if (existing) {
      existing.checked = true;
      selectedMaterials.add(existing.value);
      formCategories.add(existing.value);
    } else {
      selectedMaterials.add(category);
      formCategories.add(category);
      renderMaterialOptions();
    }
    categoryInput.value = "";
    categoryInput.hidden = true;
    addCategoryButton.hidden = true;
  });
  addCategoryButton.hidden = true;
  categoryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCategoryButton.click();
    }
  });
  categoryControls.append(addCategory, categoryInput, addCategoryButton);
  const renderMaterialOptions = () => {
    materialOptions.replaceChildren();
    for (const category of materialCategories([
      ...formCategories,
      ...selectedMaterials,
    ])) {
      const checkbox = input("checkbox");
      checkbox.value = category;
      checkbox.checked = selectedMaterials.has(category);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedMaterials.add(category);
        else selectedMaterials.delete(category);
      });
      const label = node("label", "recy-material-option");
      label.append(checkbox, node("span", "", category));
      materialOptions.append(label);
    }
  };
  renderMaterialOptions();
  const materialsField = node("div", "recy-portal-field");
  materialsField.append(node("span", "", "Materiais aceitos"), materialOptions);
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
  map.setAttribute("role", "region");
  map.setAttribute("aria-label", "Seleção da localização do ponto de coleta");
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
    materialsField,
    categoryControls,
    field("Latitude", lat),
    field("Longitude", lon),
    map,
    field("Horário", hours),
    field("Telefone", phone),
    field("Observações", notes),
    save,
    status,
  );
  const mapFields = { latitude: lat, longitude: lon, pointType: type };
  renderAdminMap(map, mapFields);
  const updatePreview = () => {
    renderAdminMap(map, mapFields);
    if (lat.value && lon.value) {
      addSelectionMarker(map, lat.value, lon.value);
    }
  };
  lat.addEventListener("input", updatePreview);
  lon.addEventListener("input", updatePreview);
  type.addEventListener("change", () => {
    if (type.value === "uefs" && !address.value.trim()) {
      address.value = "Campus UEFS";
    }
    updatePreview();
  });
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
      accepted_materials: Array.from(selectedMaterials),
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
      status.textContent = /row-level security policy/i.test(error.message)
        ? "O Supabase recusou a gravação: confirme se este usuário está cadastrado em public.app_admins e se as políticas do setup.sql foram aplicadas."
        : error.message;
      status.className = "recy-portal-message recy-portal-message-error";
      save.disabled = false;
    }
  });
  container.append(form);
}

function renderPointAdmin(container) {
  const editor = node("div");
  container.append(
    node(
      "p",
      "recy-portal-muted",
      "Os pontos são organizados por localização. Escolha um ponto para editar ou adicione um novo pelo mapa correspondente.",
    ),
    editor,
  );

  const pointTypes = [
    ["feira", "Pontos de Feira", "Pontos cadastrados em Feira de Santana."],
    ["uefs", "Pontos da UEFS", "Pontos cadastrados no campus da UEFS."],
  ];
  for (const [type, title, description] of pointTypes) {
    const section = node("section", "recy-point-admin-section");
    const heading = node("div", "recy-point-admin-heading");
    heading.append(
      node("h2", "", title),
      button(
        "Adicionar ponto",
        () => renderPointForm(editor, null, type),
        "recy-portal-button recy-portal-button-primary",
      ),
    );
    section.append(heading, node("p", "recy-portal-muted", description));
    const grid = node("div", "recy-portal-grid");
    const points = collectionPoints.filter((point) => point.point_type === type);
    if (!points.length) {
      grid.append(node("p", "recy-portal-empty", "Nenhum ponto cadastrado."));
    }

    for (const point of points) {
      const card = node("article", "recy-portal-card");
      card.append(
        node("h3", "", point.name),
        node("p", "recy-portal-muted", `${type === "uefs" ? "UEFS" : "Feira"} · ${point.region || point.address}`),
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
    section.append(grid);
    container.append(section);
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

function openPointSuggestionForm() {
  const { page } = portalPage(
    "Solicitar novos pontos",
    "Ajude a ampliar o mapa de locais de coleta.",
  );
  const form = node("form", "recy-portal-card recy-suggestion-form");
  form.append(
    node(
      "h2",
      "recy-suggestion-question",
      "Conhece algum outro ponto que a gente não cadastrou? Conta pra gente.",
    ),
    node(
      "p",
      "recy-portal-muted",
      "Envie o nome e a localização. A equipe vai conferir as informações antes de adicionar o ponto ao mapa.",
    ),
  );
  const name = input("text", "", "Nome do ponto de coleta");
  name.maxLength = 120;
  name.required = true;
  const address = input("text", "", "Endereço, bairro ou referência");
  address.maxLength = 240;
  address.required = true;
  const notes = textarea("", "Horários, materiais aceitos ou outras informações úteis");
  notes.maxLength = 500;
  form.append(
    field("Nome do local", name),
    field("Localização", address),
    field("Informações adicionais (opcional)", notes),
    node(
      "p",
      "recy-portal-muted",
      "Não inclua dados pessoais. As sugestões são enviadas sem identificar você.",
    ),
  );
  const status = node("p", "recy-portal-muted");
  const submit = node(
    "button",
    "recy-portal-button recy-portal-button-primary",
    "Enviar sugestão",
  );
  submit.type = "submit";
  form.append(submit, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = "Enviando sugestão...";
    try {
      await request("/rest/v1/point_suggestions", {
        method: "POST",
        returnRepresentation: false,
        body: {
          user_id: null,
          name: name.value.trim(),
          address: address.value.trim(),
          notes: notes.value.trim(),
          status: "pending",
        },
      });
      form.reset();
      status.textContent = "Obrigado! Sua sugestão foi enviada para análise.";
    } catch (error) {
      status.textContent = `Não foi possível enviar a sugestão: ${error.message}`;
      status.className = "recy-portal-message recy-portal-message-error";
      submit.disabled = false;
    }
  });
  page.append(form, button("Voltar ao app", closePortal));
}

async function renderSuggestionsAdmin(container) {
  container.append(
    node(
      "p",
      "recy-portal-muted",
      "Sugestões enviadas pelos visitantes. Confira cada local antes de cadastrá-lo no mapa.",
    ),
  );
  try {
    const suggestions = await request(
      tablePath("point_suggestions", {
        select: "id,name,address,notes,status,created_at",
        order: "created_at.desc",
      }),
      { token: currentSession()?.accessToken },
    );
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      container.append(node("p", "recy-portal-empty", "Ainda não há sugestões."));
      return;
    }
    const grid = node("div", "recy-portal-grid");
    for (const suggestion of suggestions) {
      const card = node("article", "recy-portal-card");
      const submittedAt = suggestion.created_at
        ? new Date(suggestion.created_at).toLocaleString("pt-BR")
        : "Data não informada";
      card.append(
        node("p", "recy-portal-muted", `${suggestion.status} · ${submittedAt}`),
        node("h3", "", suggestion.name),
        node("p", "", suggestion.address || "Localização não informada"),
      );
      if (suggestion.notes) card.append(node("p", "", suggestion.notes));
      if (suggestion.status === "pending") {
        const actions = node("div", "recy-portal-actions");
        for (const [status, label] of [["approved", "Marcar conferida"], ["rejected", "Arquivar"]]) {
          actions.append(button(label, async () => {
            try {
              await request(tablePath("point_suggestions", {
                id: `eq.${suggestion.id}`,
              }), {
                method: "PATCH",
                body: { status },
                token: currentSession()?.accessToken,
              });
              renderAdmin();
            } catch (error) {
              message(container, error.message, true);
            }
          }));
        }
        card.append(actions);
      }
      grid.append(card);
    }
    container.append(grid);
  } catch (error) {
    message(container, error.message, true);
  }
}

function renderAdmin() {
  const { page, header } = portalPage(
    "Administração do RecySouls",
    "Gerencie pontos e conteúdo educativo.",
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
    ["suggestions", "Sugestões de pontos"],
    ["content", "Filosofia e Pergaminhos"],
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
  else if (activeAdminTab === "suggestions") void renderSuggestionsAdmin(content);
  else renderContentAdmin(content);
}

async function openAdmin(emailValue = "") {
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
    collectionPoints = Array.isArray(points)
      ? points.filter((point) => point.id !== exampleUefsPointId)
      : [];
    await seedBuiltInContent(session, Array.isArray(entries) ? entries : []);
    const refreshedEntries = await request(tablePath("content_entries", {
      select: "*",
      order: "created_at.asc",
    }), { token: session.accessToken });
    learningEntries = Array.isArray(refreshedEntries) ? refreshedEntries : [];
    applySharedContent(learningEntries);
    renderAdmin();
  } catch (error) {
    openAdminLogin(error.message, emailValue);
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
    "Mapa do campus desenhado no estilo do RecySouls.",
  );
  const actions = node("div", "recy-portal-actions");
  actions.append(button("Voltar ao app", closePortal));
  const mapFrame = node("div", "recy-uefs-map-frame");
  const map = node("div", "recy-portal-map recy-uefs-campus-map");
  map.setAttribute("role", "region");
  map.setAttribute("aria-label", "Mapa posicional do campus da UEFS e pontos de coleta");
  const mapContent = node("div", "recy-uefs-map-content");
  mapContent.append(buildUefsCampusDrawing());
  const mapLabel = node(
    "span",
    "recy-portal-map-label recy-uefs-map-label",
    "UEFS · MÓDULOS E VIAS POSICIONAIS",
  );
  const mapAttribution = node(
    "a",
    "recy-uefs-attribution-link",
    "© OSM contributors · ODbL",
  );
  mapAttribution.href = "https://www.openstreetmap.org/copyright";
  mapAttribution.target = "_blank";
  mapAttribution.rel = "noopener noreferrer";
  const zoomLevel = node("output", "recy-uefs-zoom-level", "100%");
  zoomLevel.setAttribute("aria-live", "polite");
  const zoomControls = node("div", "recy-uefs-map-controls");
  const zoomOut = button("−", () => setMapZoom(zoom - 0.25), "recy-uefs-zoom-button");
  zoomOut.setAttribute("aria-label", "Afastar mapa");
  const zoomIn = button("+", () => setMapZoom(zoom + 0.25), "recy-uefs-zoom-button");
  zoomIn.setAttribute("aria-label", "Aproximar mapa");
  const zoomReset = button("100%", () => setMapZoom(1), "recy-uefs-zoom-reset");
  zoomReset.setAttribute("aria-label", "Restaurar zoom original");
  zoomControls.append(zoomOut, zoomLevel, zoomIn, zoomReset);
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const setMapZoom = (value) => {
    zoom = Math.max(1, Math.min(3, value));
    const maxPanX = Math.max(
      0,
      (mapContent.offsetWidth * zoom - map.clientWidth) / 2,
    );
    const maxPanY = Math.max(
      0,
      (mapContent.offsetHeight * zoom - map.clientHeight) / 2,
    );
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    mapContent.style.setProperty("--uefs-map-pan-x", `${panX}px`);
    mapContent.style.setProperty("--uefs-map-pan-y", `${panY}px`);
    mapContent.style.setProperty("--uefs-map-zoom", String(zoom));
    zoomLevel.value = `${Math.round(zoom * 100)}%`;
    zoomLevel.textContent = zoomLevel.value;
    zoomOut.disabled = zoom <= 1;
    zoomIn.disabled = zoom >= 3;
    zoomReset.disabled = zoom === 1;
  };
  zoomControls.addEventListener("click", (event) => event.stopPropagation());
  map.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setMapZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
    },
    { passive: false },
  );
  let activePointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  map.addEventListener("pointerdown", (event) => {
    const canPan =
      mapContent.offsetWidth * zoom > map.clientWidth ||
      mapContent.offsetHeight * zoom > map.clientHeight;
    if (
      !canPan ||
      event.button !== 0 ||
      event.target.closest(
        ".recy-uefs-map-controls, .recy-uefs-map-label, .recy-uefs-attribution-link, .recy-uefs-custom-marker",
      )
    ) {
      return;
    }
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = panX;
    dragOriginY = panY;
    map.setPointerCapture(activePointerId);
    map.classList.add("recy-uefs-map-dragging");
    event.preventDefault();
  });
  map.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    panX = dragOriginX + event.clientX - dragStartX;
    panY = dragOriginY + event.clientY - dragStartY;
    setMapZoom(zoom);
  });
  const finishMapDrag = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    map.classList.remove("recy-uefs-map-dragging");
    if (map.hasPointerCapture(event.pointerId)) {
      map.releasePointerCapture(event.pointerId);
    }
  };
  map.addEventListener("pointerup", finishMapDrag);
  map.addEventListener("pointercancel", finishMapDrag);
  map.addEventListener("lostpointercapture", finishMapDrag);
  map.append(mapContent, mapLabel, zoomControls, mapAttribution);
  mapFrame.append(map);
  const details = node("article", "recy-portal-card recy-uefs-point-details");
  details.id = "recy-uefs-point-details";
  const pointMarkers = new Map();
  const showPointDetails = (point) => {
    details.replaceChildren(node("h3", "", point.name), node("p", "", point.address));
    if (point.accepted_materials?.length) {
      details.append(
        node("p", "recy-portal-muted", point.accepted_materials.join(", ")),
      );
    }
    if (point.hours) {
      details.append(node("p", "recy-portal-muted", point.hours));
    }
    pointMarkers.forEach((marker, markerPoint) => {
      marker.setAttribute("aria-pressed", String(markerPoint === point));
    });
  };
  const legend = node(
    "p",
    "recy-portal-legend",
    "● Ponto de coleta · Selecione um marcador no mapa para ver as informações.",
  );
  const list = node("div", "recy-portal-grid");
  page.append(
    actions,
    mapFrame,
    legend,
    details,
  );
  const uefsPoints = collectionPoints.filter(
    (point) =>
      point.point_type === "uefs" &&
      Number.isFinite(Number(point.latitude)) &&
      Number.isFinite(Number(point.longitude)),
  );
  uefsPoints.forEach((point) => {
    const position = uefsPointToPercent(point);
    const marker = node(
      "button",
      "recy-portal-marker recy-portal-marker-uefs recy-uefs-custom-marker",
    );
    marker.type = "button";
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.title = point.name;
    marker.setAttribute("aria-label", point.name);
    marker.setAttribute("aria-controls", details.id);
    marker.setAttribute("aria-pressed", "false");
    marker.setAttribute("data-label", point.name);
    marker.addEventListener("click", () => showPointDetails(point));
    mapContent.append(marker);
    pointMarkers.set(point, marker);
  });
  if (uefsPoints.length) {
    details.append(
      node("h3", "", "Pontos da UEFS"),
      node("p", "recy-portal-muted", "Selecione um ponto no mapa para ver as informações."),
    );
  } else {
    details.append(
      node("h3", "", "Nenhum ponto cadastrado"),
      node("p", "recy-portal-muted", "Ainda não há pontos de coleta cadastrados na UEFS."),
    );
    list.append(node("p", "recy-portal-empty", "Nenhum ponto cadastrado."));
  }
  setMapZoom(zoom);
  if (loadError) {
    message(list, `Não foi possível carregar os pontos compartilhados: ${loadError}`, true);
    return;
  }
  try {
    collectionPoints
      .filter((point) => point.point_type === "uefs")
      .forEach((point) => {
        const card = node("article", "recy-portal-card recy-uefs-point-row");
        card.append(node("h3", "", point.name));
        card.append(button("Ver informações", () => showPointDetails(point)));
        list.append(card);
      });
    page.append(node("h2", "", "Pontos cadastrados"), list);
  } catch (error) {
    message(page, error.message, true);
  }
}

function setMainMapZoom(map, value) {
  const zoom = Math.max(1, Math.min(3, value));
  const maxPanX = Math.max(0, (map.clientWidth * zoom - map.clientWidth) / 2);
  const maxPanY = Math.max(0, (map.clientHeight * zoom - map.clientHeight) / 2);
  map.dataset.recyMapZoom = String(zoom);
  map.dataset.recyMapPanX = String(
    Math.max(-maxPanX, Math.min(maxPanX, Number(map.dataset.recyMapPanX) || 0)),
  );
  map.dataset.recyMapPanY = String(
    Math.max(-maxPanY, Math.min(maxPanY, Number(map.dataset.recyMapPanY) || 0)),
  );
}

function installMainMapZoom(map) {
  const zoom = Number(map.dataset.recyMapZoom) || 1;
  const panX = Number(map.dataset.recyMapPanX) || 0;
  const panY = Number(map.dataset.recyMapPanY) || 0;
  const controlPanel = Array.from(map.children).find((child) =>
    child.classList.contains("bottom-3") && child.classList.contains("right-3"),
  );
  const statusPanel = Array.from(map.children).find((child) =>
    child.classList.contains("top-3") && child.classList.contains("left-3"),
  );
  for (const child of map.children) {
    if (child === controlPanel || child === statusPanel) {
      child.style.transform = "";
      child.style.transformOrigin = "";
      continue;
    }
    if (child.classList.contains("recy-portal-uefs-indicator-layer")) {
      child.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      child.style.transformOrigin = "center";
      continue;
    }
    if (child.classList.contains("marker")) {
      child.dataset.recyBaseLeft = child.dataset.recyBaseLeft || child.style.left;
      child.dataset.recyBaseTop = child.dataset.recyBaseTop || child.style.top;
      const baseLeft = Number.parseFloat(child.dataset.recyBaseLeft);
      const baseTop = Number.parseFloat(child.dataset.recyBaseTop);
      const bounds = map.getBoundingClientRect();
      child.style.left = `${50 + (baseLeft - 50) * zoom + (bounds.width ? panX / bounds.width * 100 : 0)}%`;
      child.style.top = `${50 + (baseTop - 50) * zoom + (bounds.height ? panY / bounds.height * 100 : 0)}%`;
      child.style.scale = String(zoom);
      continue;
    }
    child.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    child.style.transformOrigin = "center";
  }
  if (!map.dataset.recyMapInteractionsInstalled) {
    map.dataset.recyMapInteractionsInstalled = "true";
    map.style.touchAction = "none";
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    map.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target.closest("button") : null;
        if (!target || !map.contains(target)) return;
        const direction = target.textContent.trim();
        if (direction !== "+" && direction !== "−" && direction !== "-") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const currentZoom = Number(map.dataset.recyMapZoom) || 1;
        const increment = direction === "+" ? 0.25 : -0.25;
        setMainMapZoom(map, currentZoom + increment);
        installMainMapZoom(map);
      },
      true,
    );
    map.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const currentZoom = Number(map.dataset.recyMapZoom) || 1;
      if (
        event.button !== 0 ||
        currentZoom <= 1 ||
        target?.closest("button, .marker, .top-3.left-3, .bottom-3.right-3")
      ) {
        return;
      }
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originX = Number(map.dataset.recyMapPanX) || 0;
      originY = Number(map.dataset.recyMapPanY) || 0;
      map.setPointerCapture(activePointerId);
      map.classList.add("recy-main-map-dragging");
      event.preventDefault();
    });
    map.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) return;
      const zoomValue = Number(map.dataset.recyMapZoom) || 1;
      const maxPanX = Math.max(0, (map.clientWidth * zoomValue - map.clientWidth) / 2);
      const maxPanY = Math.max(0, (map.clientHeight * zoomValue - map.clientHeight) / 2);
      map.dataset.recyMapPanX = String(Math.max(-maxPanX, Math.min(maxPanX, originX + event.clientX - startX)));
      map.dataset.recyMapPanY = String(Math.max(-maxPanY, Math.min(maxPanY, originY + event.clientY - startY)));
      installMainMapZoom(map);
    });
    const finishDrag = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      map.classList.remove("recy-main-map-dragging");
      if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    };
    map.addEventListener("pointerup", finishDrag);
    map.addEventListener("pointercancel", finishDrag);
    map.addEventListener("lostpointercapture", finishDrag);
    map.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const currentZoom = Number(map.dataset.recyMapZoom) || 1;
        setMainMapZoom(map, currentZoom + (event.deltaY < 0 ? 0.25 : -0.25));
        installMainMapZoom(map);
      },
      { passive: false },
    );
  }
}

function installUefsMapIndicator(map) {
  let layer = map.querySelector(".recy-portal-uefs-indicator-layer");
  if (layer) return;
  layer = node("div", "recy-portal-uefs-indicator-layer");
  layer.style.cssText = "position:absolute;inset:0;z-index:5;pointer-events:none";
  const position = coordinateToPercent({
    latitude: -12.1999817,
    longitude: -38.9714984,
  });
  const marker = button(
    "",
    openUefsPoints,
    "recy-portal-marker recy-portal-marker-uefs recy-main-uefs-marker",
  );
  marker.style.left = `${position.x}%`;
  marker.style.top = `${position.y}%`;
  marker.style.pointerEvents = "auto";
  marker.title = "Abrir pontos da UEFS";
  marker.setAttribute("aria-label", "UEFS — ver pontos de coleta do campus");
  layer.append(marker);
  map.append(layer);
}

function updateMapMarkers() {
  const map = document.querySelector("#map-tab .map-container");
  if (!map) return;
  const contourLabel = Array.from(map.querySelectorAll("svg text")).find(
    (label) => label.textContent.trim() === "Contorno de Feira de Santana",
  );
  if (contourLabel) {
    contourLabel.textContent = "Anel de Contorno - Feira de Santana";
    contourLabel.setAttribute("opacity", "0.35");
  }
  map.querySelector(".recy-portal-map-layer")?.remove();
  installUefsMapIndicator(map);
  installMainMapZoom(map);
}

function installNavigationButtons() {
  const nav = document.querySelector("#mainsystem-tabs");
  if (!nav) return;
  if (!nav.querySelector("#recy-uefs-nav")) {
    const uefs = button("Pontos da UEFS", openUefsPoints, "recy-portal-nav-button w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all");
    uefs.id = "recy-uefs-nav";
    nav.append(uefs);
  }
  if (!nav.querySelector("#recy-point-suggestion-nav")) {
    const suggestions = button(
      "Solicitar novos pontos",
      openPointSuggestionForm,
      "recy-portal-nav-button w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all",
    );
    suggestions.id = "recy-point-suggestion-nav";
    nav.append(suggestions);
  }
  document.getElementById("recy-admin-login")?.remove();
  const sidebar = nav.parentElement;
  if (sidebar && !sidebar.querySelector("#recy-admin-nav")) {
    const adminAccess = button(
      "Acesso administrativo",
      () => openAdminLogin(),
      "recy-sidebar-admin-button",
    );
    adminAccess.id = "recy-admin-nav";
    sidebar.append(adminAccess);
  }
}

function installAuthScreen() {
  if (!appRoot) return;
  portalRoot.querySelector("[data-recy-auth-screen]")?.remove();
  appRoot.hidden = false;
  appRoot.inert = false;
  appRoot.removeAttribute("aria-hidden");
  const accountPanel = document.querySelector("#mainsystem-tabs")?.nextElementSibling;
  if (accountPanel?.querySelector("button")?.textContent.trim().toLowerCase() === "sair") {
    accountPanel.remove();
  }
  appRoot.querySelector('button[title="Sair da conta"]')?.remove();
}

const appObserver = new MutationObserver(() => {
  installAuthScreen();
  installNavigationButtons();
  updateMapMarkers();
});
if (appRoot) {
  appObserver.observe(appRoot, { childList: true, subtree: true });
  installAuthScreen();
}

void loadPublicData().catch((error) => {
  console.error("Não foi possível carregar conteúdo compartilhado:", error);
});