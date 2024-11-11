import http from "http";
import fs from "fs";
import { randomUUID } from "crypto";
import express from "express";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}
const context = fileToGenerativePart("public/context.pdf", "application/pdf");

const app = express();
const server = http.createServer(app);
const ws = new WebSocketServer({ server });

app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    candidateCount: 1, // Generate only one response to speed up generation
    temperature: 0.3, // Lower creativity for more factual responses
    topP: 0.8, // Sample from more likely token outputs
  },
});

ws.on("connection", (connection) => {
  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [
          {
            ...context,
          },
          {
            text: `
              You are now acting as a desk agent for our company. Your role is to assist with answering customer queries, providing information, handling requests, and resolving issues efficiently. 

              **Important guidelines:**
              1. Base all responses strictly on the context provided from the PDF file. Do not generate information that is not directly found in the PDF or company context.
              2. Avoid referencing or relying on external knowledge unless the user explicitly requests additional information beyond the provided context.
              3. Respond in clear, natural language, while keeping responses concise and focused on the user’s query.
              4. Never mention the existence of the PDF file or the fact that you are using it for reference. All responses should appear natural as if you have internal knowledge of the company.
              
              Your goal is to provide accurate and helpful responses that are grounded in the company's information, ensuring that all interactions are relevant to the company's policies, procedures, and services.
            `,
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Understood. I will respond as a desk agent for the company based solely on the information provided in the context. I will not refer to external knowledge unless asked to do so, and I will avoid mentioning the PDF file or its use in my responses.",
          },
        ],
      },
    ],
  });

  connection.send(`
    <div hx-swap-oob="beforeend:#chat">
      <p class="text-center text-white">
        Websocket connection successful. A new chat session has started with a
        fresh history.
      </p>
    </div>
  `);

  connection.on("message", async (message) => {
    const prompt = JSON.parse(message.toString()).prompt;
    const id = randomUUID();

    connection.send(`
      <div hx-swap-oob="beforeend:#chat">
        <div>
          <div class="text-end">
            <div class="inline-block bg-blue-500 text-white p-3 rounded-lg rounded-br-none max-w-[75%]">
              ${prompt}
            </div>
          </div>

          <div class="text-start mt-2" >
            <div class="inline-block bg-gray-600 text-white p-3 rounded-lg rounded-bl-none max-w-[75%]">
              <md-block id="response-${id}" class="animate-pulse">AI is thinking...</md-block>
            </div>
          </div>
        </div>
      </div>
    `);

    try {
      const result = await chat.sendMessageStream(prompt);
      const chunks = [];
      connection.send(`<md-block id="response-${id}"></md-block>`);
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        chunks.push(chunkText);
        connection.send(
          `<md-block hx-swap-oob="beforeend:#response-${id}">${chunkText}</md-block>`,
        );
      }

      const finalResponse = chunks.join("");
      connection.send(
        `<md-block id="response-${id}">${finalResponse}</md-block>`,
      );
    } catch (error) {
      console.log(error);
      connection.send(`<md-block id="response-${id}"></md-block>`);
      connection.send(
        `<md-block id="response-${id}">There was an error while generating the response, please refresh and start a new chat</md-block>`,
      );
    }
  });
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`server running on port ${port}`);
});
