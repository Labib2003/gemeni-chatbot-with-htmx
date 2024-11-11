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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
            text: "You are now acting as a desk agent for our company. Your role is to assist with answering customer queries, providing information, handling requests, and resolving issues efficiently. Use the context of the company from the PDF file to give accurate and helpful responses. Never mention or refer to the pdf file. Just respond in natural language.",
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Understood. I will now respond as a desk agent for the company based on the context provided.",
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
