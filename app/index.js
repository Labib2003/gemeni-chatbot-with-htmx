import express from "express";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer } from "ws";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const server = http.createServer(app);
const ws = new WebSocketServer({ server });

app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

ws.on("connection", (connection) => {
  const chat = model.startChat();

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
              <md-block id="response-${id}"></md-block>
            </div>
          </div>
        </div>
      </div>
    `);

    const result = await chat.sendMessageStream(prompt);
    const chunks = [];
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
  });
});

server.listen(5000, () => {
  console.log("server running on port 5000");
});
