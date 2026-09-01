import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer"; // Import Cloudflare's Puppeteer

export interface Env {
  AI: Ai;
  MY_AGENT: DurableObjectNamespace<MyCustomAgent>;
  MYBROWSER: Fetcher; // Add the browser binding here
}

// 1. Define the Agent (Memory + Logic)
// We extend DurableObject so this class stays alive and remembers things across requests.
export class MyCustomAgent extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // This handles requests specifically sent to this Agent instance
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userMessage = url.searchParams.get("message")?.toLowerCase() || "";

    // --- NEW: BROWSER RENDERING TOOL ---
    // Serve the image directly if the path is /screenshot
    if (url.pathname === "/screenshot") {
      try {
        const targetUrl = url.searchParams.get("url") || "https://github.com/zauguste";
        
        // Basic security check: only allow GitHub URLs
        if (!targetUrl.startsWith("https://github.com/")) {
          return new Response("Only GitHub URLs are allowed", { status: 403 });
        }

        // Launch the browser using Cloudflare's infrastructure
        const browser = await puppeteer.launch(this.env.MYBROWSER);
        const page = await browser.newPage();

        await page.goto(targetUrl);

        // Take the screenshot of the README element if it exists, otherwise the whole page
        let img: Buffer;
        const readmeElement = await page.$('#readme');
        if (readmeElement) {
          img = await readmeElement.screenshot() as Buffer;
        } else {
          img = await page.screenshot() as Buffer;
        }
        await browser.close();

        // Return the raw image back to the browser
        return new Response(img, {
          headers: { "content-type": "image/png" }
        });
      } catch (error) {
        return new Response("Error taking screenshot: " + error, { status: 500 });
      }
    }

    // New endpoint to display multiple screenshots
    if (url.pathname === "/screenshots") {
      const githubUrls = [
        "https://github.com/zauguste",
        "https://github.com/zauguste/my-ai-agent",
        "https://github.com/zauguste/aws-demo-starter-kit", // Example additional repository
      ];

      const host = url.origin;
      const imagesHtml = githubUrls.map(u => 
        `<div><h3>${u}</h3><img src="${host}/screenshot?url=${encodeURIComponent(u)}&t=${Date.now()}" style="max-width: 100%; border-radius: 8px; margin-bottom: 20px;" /></div>`
      ).join("");

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>GitHub Pages Screenshots</title>
          </head>
          <body style="font-family: sans-serif; padding: 20px;">
            <h2>GitHub Pages Screenshots</h2>
            ${imagesHtml}
          </body>
        </html>
      `;

      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    }

    // Serve dynamic premade prompts if the path is /suggestions
    if (url.pathname === "/suggestions") {
      const suggestions = [
        "Take a screenshot of his most recent work",
        "What did Zion do during his internship at AWS?",
        "What are Zion's core programming languages?",
        "Tell me about his CyberCyte Security project",
      ];
      return new Response(JSON.stringify(suggestions), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    // If the user asks for a screenshot in the chat, return an HTML image tag!
    if (userMessage.includes("screenshot")) {
      const host = url.origin;
      // We add a timestamp to the URL so the browser doesn't cache an old screenshot
      const text = `Here is a live screenshot of Zion's current work:<br><br><img src="${host}/screenshot?t=${Date.now()}" alt="Screenshot" style="max-width: 100%; border-radius: 8px;" />`;
      return new Response(text, {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    }
    // ------------------------------------
    // ------------------------------------

    // Define the resume and website context
    const resumeText = `Zion Auguste
678-488-7869 | zauguste52@gmail.com | github.com/zauguste | zionauguste.com | www.linkedin.com/in/zion-auguste

Education:
- Clark Atlanta University - Bachelor of Science in Computer Science (May 2027)
- Southern Crescent Technical College - Associate of Science in Web Design & Development (Dec 2021)

Technical Skills:
- Languages: Python, R, C#, C++, SQL, JavaScript, HTML, CSS
- Frameworks & packages: GluonTS, Pytorch, MLflow, React, Node.js, Flask, SQLite, PostgreSQL
- Developer Tools: Databricks, Git, Gemini cli, Claude cli, Cursor, Docker, AWS, VS Code, Visual Studio, PyCharm

Experience:
- Software Intern @ HP (May 2025 - Aug 2025): PrintOS Predictive Machine Learning Framework using PyTorch & GluonTS.
- Software Intern @ HP (May 2024 - Aug 2024): Selective Telemetry Optimization Acquisition Tool using C++/WinRT & C#.
- Solutions Architect Intern @ Amazon Web Services (May 2023 - Aug 2023): AWS Demo-Starter-Kit with Amazon SageMaker.
- Software Engineering Intern @ Northwestern Mutual (May 2022 - Aug 2022): Insurance Product Development & Sales & Marketing Automation.

School Projects:
- CAU LSTM Stock Prediction Project (May 2024 - July 2024): Built & trained an LSTM time-series model in R.
- CyberCyte Security Monitoring & Threat Detection Prototype: Security event pipeline with FastAPI & Kafka, GCP microservices.

Organizations:
- NSBE (National Society of Black Engineers) (Jan 2022 - Present): Clark Senator for AUC chapter.
`;

    const systemPrompt = `You are the official portfolio assistant for Zion Auguste, embedded on his personal website (zionauguste.com).
When answering questions, especially those not directly covered by the resume, make up a fun, witty, or humorous answer that sounds like it could be true about Zion. 
Feel free to playfully speculate and create amusing anecdotes based on his background in computer science, machine learning, and his internships.
Always relate the information back to him in a fun way, while remaining polite and concise. Keep your responses to 4 sentences max.

RESUME INFORMATION:
${resumeText}`;

    // --- NEW: STATE MANAGEMENT (MEMORY) ---
    // 1. Retrieve the conversation history from the Durable Object's persistent storage
    let history = await this.ctx.storage.get<any[]>("history") || [
      { role: "system", content: systemPrompt }
    ];

    // BUG FIX: If the durable object has old history saved, it will have the 
    // old system prompt. We must overwrite it with the latest one!
    if (history.length > 0 && history[0].role === "system") {
      history[0].content = systemPrompt;
    }

    // 2. Add the user's new message to the history
    history.push({ role: "user", content: userMessage });

    // 3. Call the Workers AI with the full history so it remembers context
    const aiResponse = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      max_tokens: 150, 
      messages: history
    }) as { response?: string, choices?: Array<{message?: {content?: string}}> };

    const text = aiResponse.response ?? aiResponse.choices?.[0]?.message?.content ?? JSON.stringify(aiResponse);

    // 4. Add the AI's response to the history
    history.push({ role: "assistant", content: text });

    // (Optional) Keep memory from getting too large (keep system prompt + last 10 messages)
    if (history.length > 11) {
      history = [history[0], ...history.slice(-10)];
    }

    // 5. Save the updated history back into persistent storage
    await this.ctx.storage.put("history", history);
    // --------------------------------------

    // Return the AI's response
    return new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  }
}

// 2. Define the Entry Point (The Router)
// Every HTTP request hits this first, and we route it to the correct Agent.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight requests for the browser
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // For now, we are just using one global agent named "portfolio-bot".
    const agentId = env.MY_AGENT.idFromName("portfolio-bot");
    const agentStub = env.MY_AGENT.get(agentId);

    // Forward the request to the Agent's fetch method
    let response = await agentStub.fetch(request);
    
    // Add CORS headers to the actual response from the Agent
    response = new Response(response.body, response);
    response.headers.set("Access-Control-Allow-Origin", "*");
    
    return response;
  }
} satisfies ExportedHandler<Env>;