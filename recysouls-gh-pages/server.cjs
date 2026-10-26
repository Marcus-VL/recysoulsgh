var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "15mb" }));
var hasActiveGeminiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  return !!key && key !== "MY_GEMINI_API_KEY" && key.trim() !== "";
};
var _ai = null;
var getGeminiClient = () => {
  if (!hasActiveGeminiKey()) {
    throw new Error("GEMINI_API_KEY environment variable is not configured with a valid key.");
  }
  if (!_ai) {
    _ai = new import_genai.GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return _ai;
};
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: hasActiveGeminiKey()
  });
});
app.post("/api/scan", async (req, res) => {
  try {
    const { image, textFallback } = req.body;
    if (!hasActiveGeminiKey()) {
      console.warn("Using smart fallback offline identification because GEMINI_API_KEY is not configured.");
      const query = (textFallback || "aparelho").toLowerCase();
      let detectedName = textFallback || "Aparelho Desconhecido";
      let category = "Outros Eletr\xF4nicos";
      let weight = 1.2;
      let recyclable = ["Cobre", "Pl\xE1stico ABS", "Alum\xEDnio", "Soldas de Estanho"];
      let toxic = ["Tra\xE7os de Chumbo", "Retardantes de Chama Bromados"];
      let points = 30;
      let descarte = "Entregue em ecopontos com recep\xE7\xE3o de pequenos eletr\xF4nicos ou inform\xE1tica.";
      if (query.includes("notebook") || query.includes("dell") || query.includes("computador") || query.includes("laptop")) {
        detectedName = textFallback || "Notebook Comput\xE1vel";
        category = "Computadores / Notebooks";
        weight = 2.1;
        recyclable = ["Placa de Circuito Impresso", "Carca\xE7a de Alum\xEDnio", "Ouro dos Conectores", "Cobre das Bobinas", "Estanho"];
        toxic = ["Bateria de \xCDon de L\xEDtio", "Chumbo nas soldas antigas", "Merc\xFArio no backlight (se antigo)"];
        points = 60;
        descarte = "Remova cart\xF5es de mem\xF3ria extras. Descarte preferencialmente intacto no EcoPoint Centro ou Cidade Nova para destina\xE7\xE3o segura de baterias de l\xEDtio.";
      } else if (query.includes("celular") || query.includes("iphone") || query.includes("samsung") || query.includes("motorola") || query.includes("telefone") || query.includes("smartphone")) {
        detectedName = textFallback || "Smartphone Gen\xE9rico";
        category = "Celulares / Tablets";
        weight = 0.2;
        recyclable = ["Placa de circuito com ouro/cobre/sil\xEDcio", "Vidro da tela", "Carca\xE7a protetora"];
        toxic = ["Bateria de L\xEDtio selada", "Cobalto", "N\xEDquel t\xF3xico"];
        points = 50;
        descarte = "Fa\xE7a backup de dados e restaure de f\xE1brica. Deposite nos nichos espec\xEDficos de celulares do EcoPoint Kalil\xE2ndia ou Centro.";
      } else if (query.includes("pilha") || query.includes("bateria") || query.includes("duracell") || query.includes("rayovac")) {
        detectedName = textFallback || "Combo de Pilhas / Baterias";
        category = "Pilhas / Baterias";
        weight = 0.3;
        recyclable = ["Zinco", "Mangan\xEAs", "Recipiente de A\xE7o"];
        toxic = ["C\xE1dmio", "N\xEDquel", "Merc\xFArio", "L\xEDtio inflam\xE1vel"];
        points = 25;
        descarte = "Guarde em recipiente de pl\xE1stico r\xEDgido e seco. Nunca misture com lixo org\xE2nico. Compat\xEDvel com os nichos verdes de EcoPoint Kalil\xE2ndia, Centro ou Feira VII.";
      } else if (query.includes("impressora") || query.includes("scanner") || query.includes("toner") || query.includes("hp") || query.includes("epson")) {
        detectedName = textFallback || "Impressora Multifuncional";
        category = "Impressoras / Scanners";
        weight = 4.8;
        recyclable = ["Pl\xE1stico ABS resistente", "Motores de passo (Cobre)", "Eixo de a\xE7o inox", "Cabos internos"];
        toxic = ["Res\xEDduos de P\xF3 de Carbono (Toner)", "Retardantes de chama qu\xEDmicos"];
        points = 45;
        descarte = "Remova cartuchos de tinta antes de entregar. Pode ser descartado no EcoPoint Avenida N\xF3ide Cerqueira ou Tomba.";
      } else if (query.includes("monitor") || query.includes("tv") || query.includes("tela") || query.includes("televis\xE3o")) {
        detectedName = textFallback || "Monitor LCD/LED";
        category = "Monitores / TVs";
        weight = 3.5;
        recyclable = ["Vidro plano livre de aditivos", "Moldura r\xEDgida", "Placas de controle"];
        toxic = ["F\xF3sforo residual", "Merc\xFArio em tubas CCFL (se LCD cl\xE1ssico)", "Cristal l\xEDquido bruto"];
        points = 55;
        descarte = "Evite trincar a tela para evitar dispers\xE3o de vapores qu\xEDmicos. Entregue no EcoPoint Kalil\xE2ndia ou Tomba.";
      }
      return res.json({
        scanResult: {
          nome: detectedName,
          categoria: category,
          pesoEstimado: weight,
          componentesReciclaveis: recyclable,
          componentesToxicos: toxic,
          instrucoesDescarte: descarte,
          pontosEstimados: points
        },
        offline: true
      });
    }
    const ai = getGeminiClient();
    let response;
    if (image && image.includes("base64,")) {
      const parts = image.split("base64,");
      const mimeType = parts[0].split(":")[1].split(";")[0];
      const base64Data = parts[1];
      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data
        }
      };
      const textInstruction = {
        text: "Voc\xEA \xE9 um especialista em res\xEDduos tecnol\xF3gicos e sustentabilidade urbana no Brasil. Analise esta imagem que o usu\xE1rio tirou e identifique o aparelho eletr\xF4nico/bateria/cabo. Caso a imagem n\xE3o contenha um lixo eletr\xF4nico, identifique o que for mais pr\xF3ximo ou use sua melhor estimativa t\xE9cnica para o res\xEDduo presente. Retorne os dados em formato JSON em portugu\xEAs de acordo com o esquema definido."
      };
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textInstruction] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              nome: { type: import_genai.Type.STRING, description: "Marca e modelo aproximado do aparelho (ex: Notebook Dell, Carregador gen\xE9rico, Celular antigo Samsung)" },
              categoria: { type: import_genai.Type.STRING, description: "Escolha uma destas exatas categorias: 'Computadores / Notebooks', 'Celulares / Tablets', 'Impressoras / Scanners', 'Monitores / TVs', 'Pilhas / Baterias', 'Eletrodom\xE9sticos Pequenos', 'Cabos / Carregadores' ou 'Outros'" },
              pesoEstimado: { type: import_genai.Type.NUMBER, description: "Peso aproximado em quilogramas" },
              componentesReciclaveis: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING }, description: "Lista de materiais \xFAteis que podem ser extra\xEDdos (ouro, cobre, alum\xEDnio, etc)" },
              componentesToxicos: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING }, description: "Lista de elementos perigosos (chumbo, merc\xFArio, l\xEDtio, c\xE1dmio, retardante de chamas)" },
              instrucoesDescarte: { type: import_genai.Type.STRING, description: "Instru\xE7\xF5es espec\xEDficas para o correto descarte ecol\xF3gico segura deste item" },
              pontosEstimados: { type: import_genai.Type.INTEGER, description: "Pontua\xE7\xE3o para gamifica\xE7\xE3o por reciclar este item (entre 15 e 80 com base na complexidade e perigo)" }
            },
            required: ["nome", "categoria", "pesoEstimado", "componentesReciclaveis", "componentesToxicos", "instrucoesDescarte", "pontosEstimados"]
          }
        }
      });
    } else {
      const itemDesc = textFallback || "aparelho eletr\xF4nico";
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analise estatisticamente o seguinte produto eletr\xF4nico ou res\xEDduo descrito pelo usu\xE1rio: "${itemDesc}".
                  Identifique a categoria exata de descarte e estime seu peso e componentes para reciclagem segura.
                  Retorne um objeto JSON em portugu\xEAs.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              nome: { type: import_genai.Type.STRING },
              categoria: { type: import_genai.Type.STRING },
              pesoEstimado: { type: import_genai.Type.NUMBER },
              componentesReciclaveis: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING } },
              componentesToxicos: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING } },
              instrucoesDescarte: { type: import_genai.Type.STRING },
              pontosEstimados: { type: import_genai.Type.INTEGER }
            },
            required: ["nome", "categoria", "pesoEstimado", "componentesReciclaveis", "componentesToxicos", "instrucoesDescarte", "pontosEstimados"]
          }
        }
      });
    }
    const textResult = response.text || "{}";
    const parsedData = JSON.parse(textResult.trim());
    return res.json({ scanResult: parsedData });
  } catch (error) {
    console.error("Scanning API Error:", error);
    res.status(500).json({ error: error.message || "Erro interno na an\xE1lise de IA." });
  }
});
app.post("/api/ecoroute", async (req, res) => {
  try {
    const { descricaoResiduos, ecopointsList } = req.body;
    if (!descricaoResiduos) {
      return res.status(400).json({ error: "Descri\xE7\xE3o de res\xEDduos \xE9 necess\xE1ria." });
    }
    if (!hasActiveGeminiKey()) {
      console.warn("Using smart fallback offline EcoRoute router because GEMINI_API_KEY is not configured.");
      const query = descricaoResiduos.toLowerCase();
      const identified = [];
      const recommendedPoints = [];
      if (query.includes("notebook") || query.includes("computador") || query.includes("laptop")) {
        identified.push("1x Notebook/Computador");
      }
      if (query.includes("pilha") || query.includes("bateria")) {
        identified.push("Pilhas/Baterias de L\xEDtio");
      }
      if (query.includes("celular") || query.includes("telefone")) {
        identified.push("1x Celular/Smartphone");
      }
      if (query.includes("impressora")) {
        identified.push("1x Impressora Multifuncional");
      }
      if (identified.length === 0) {
        identified.push("Res\xEDduos eletroeletr\xF4nicos mistos");
      }
      const points = ecopointsList || [];
      points.slice(0, 2).forEach((pt) => {
        recommendedPoints.push({
          ecopointId: pt.id,
          nome: pt.nome,
          endereco: pt.endereco,
          materiais_adequados: pt.materiais_aceitos.slice(0, 2),
          distanciaEstimada: (1.5 + Math.random() * 4).toFixed(1) + " km"
        });
      });
      if (recommendedPoints.length === 0) {
        recommendedPoints.push({
          ecopointId: 1,
          nome: "EcoPoint Centro",
          endereco: "Av. Get\xFAlio Vargas, 1420 - Centro",
          materiais_adequados: ["Eletr\xF4nicos em geral"],
          distanciaEstimada: "2.8 km"
        });
      }
      const totalWeight = identified.length * 1.5;
      const co2Saved = (totalWeight * 2.3).toFixed(1);
      return res.json({
        ecoRoute: {
          residuosIdentificados: identified,
          pontosRecomendados: recommendedPoints,
          rotaPassos: [
            "Passo 1: Separe os materiais eletroeletr\xF4nicos recomendados. N\xE3o desmonte carca\xE7as de pilhas.",
            "Passo 2: Embale os res\xEDduos secos de forma segura em uma pequena caixa.",
            "Passo 3: Dirija-se at\xE9 o EcoPoint mais perto da sua regi\xE3o recomendada na listagem.",
            "Passo 4: Entregue os itens ao atendente e escaneie o QRCode de coleta para computar pontos verdes no EcoMap!"
          ],
          tempoEstimado: "9 a 15 min de carro, 20 min de transporte coletivo",
          co2EvitadoEstimado: parseFloat(co2Saved)
        },
        offline: true
      });
    }
    const ai = getGeminiClient();
    const prompt = `Voc\xEA \xE9 o assistente inteligente de rotas ambientais "EcoRoute".
Voc\xEA receber\xE1 itens eletr\xF4nicos quebrados ou de descarte e uma lista de Ecopoints com materiais aceitos.
Analise a listagem, identifique quais pontos aceitam esses itens de forma otimizada para evitar que o usu\xE1rio v\xE1 a dois lugares diferentes se poss\xEDvel, sen\xE3o recomende a melhor alternativa.

Descri\xE7\xE3o do usu\xE1rio: "${descricaoResiduos}"
Ecopontos dispon\xEDveis: ${JSON.stringify(ecopointsList)}

Retorne um JSON contendo sugest\xF5es em portugu\xEAs, com passos de seguran\xE7a claros, dist\xE2ncia estimada l\xF3gica e estimativa cient\xEDfica de CO2 evitado.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            residuosIdentificados: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING }, description: "Lista concisa de aparelhos ou res\xEDduos que voc\xEA deduziu da frase do usu\xE1rio." },
            pontosRecomendados: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  ecopointId: { type: import_genai.Type.INTEGER },
                  nome: { type: import_genai.Type.STRING },
                  endereco: { type: import_genai.Type.STRING },
                  materiais_adequados: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING } },
                  distanciaEstimada: { type: import_genai.Type.STRING, description: "Dist\xE2ncia aproximada (ex: '2.5 km')" }
                },
                required: ["ecopointId", "nome", "endereco", "materiais_adequados", "distanciaEstimada"]
              },
              description: "Recomenda\xE7\xF5es dos melhores Ecopoints locais correspondentes retirados da lista."
            },
            rotaPassos: { type: import_genai.Type.ARRAY, items: { type: import_genai.Type.STRING }, description: "Passos f\xE1ceis em formato de string descrevendo a log\xEDstica, prepara\xE7\xE3o de seguran\xE7a e dep\xF3sito." },
            tempoEstimado: { type: import_genai.Type.STRING, description: "Tempo de locomo\xE7\xE3o t\xEDpico (ex: '15 minutos de carro ou 30 minutos a p\xE9')" },
            co2EvitadoEstimado: { type: import_genai.Type.NUMBER, description: "Estime a polui\xE7\xE3o reduzida em kg de CO2 (regra geral: ~2.4kg de CO2 evitado por kg de metal/pl\xE1stico eletr\xF4nico reciclado)" }
          },
          required: ["residuosIdentificados", "pontosRecomendados", "rotaPassos", "tempoEstimado", "co2EvitadoEstimado"]
        }
      }
    });
    const textResult = response.text || "{}";
    const parsedData = JSON.parse(textResult.trim());
    return res.json({ ecoRoute: parsedData });
  } catch (error) {
    console.error("EcoRoute API Error:", error);
    res.status(500).json({ error: error.message || "Erro interno na rota do EcoRoute." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RecySouls] Server is running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
