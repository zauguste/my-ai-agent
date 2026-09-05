import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer"; // Import Cloudflare's Puppeteer

export interface Env {
  AI: Ai;
  MY_AGENT: DurableObjectNamespace<MyCustomAgent>;
  MYBROWSER: Fetcher; // Add the browser binding here
  ADMIN_SECRET?: string; // Optional for local testing, can be set in dashboard
}

// 1. Define the Agent (Memory + Logic)
export class MyCustomAgent extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // Called automatically by the Durable Object Alarm system
  async alarm() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    // List all session activity timestamps
    const activityMap = await this.ctx.storage.list<number>({ prefix: "sessionActivity:" });
    
    for (const [key, lastActive] of activityMap) {
      if (now - lastActive > TWENTY_FOUR_HOURS) {
        const sessionId = key.replace("sessionActivity:", "");
        // Prune the expired session
        await this.ctx.storage.delete(`session:${sessionId}`);
        await this.ctx.storage.delete(key);
      }
    }
  }

  // This handles requests specifically sent to this Agent instance
  async fetch(request: Request): Promise<Response> {
    // Ensure alarm is set to run every hour to clean up
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (!currentAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000); // 1 hour from now
    }

    const url = new URL(request.url);
    const userMessage = url.searchParams.get("message")?.trim() || "";
    const sessionId = url.searchParams.get("sessionId") || "default";

    // --- ADMIN ENDPOINTS ---
    if (url.pathname.startsWith("/admin/")) {
      const authHeader = request.headers.get("Authorization");
      const expectedSecret = this.env.ADMIN_SECRET || "passAdminz52"; // fallback
      if (authHeader !== `Bearer ${expectedSecret}`) {
         return new Response("Unauthorized", { status: 401 });
      }

      if (url.pathname === "/admin/sessions") {
        const activityMap = await this.ctx.storage.list<number>({ prefix: "sessionActivity:" });
        const sessions = [];
        for (const [key, lastActive] of activityMap) {
          sessions.push({ sessionId: key.replace("sessionActivity:", ""), lastActive });
        }
        return new Response(JSON.stringify(sessions), { headers: { "content-type": "application/json" }});
      }

      if (url.pathname === "/admin/intervene") {
        if (request.method !== "POST") return new Response("Method not allowed", {status: 405});
        const { sessionId: targetSession, message } = await request.json() as any;
        if (!targetSession || !message) return new Response("Missing data", {status: 400});
        
        let history = await this.ctx.storage.get<any[]>(`session:${targetSession}`) || [];
        history.push({ role: "agent", content: message });
        await this.ctx.storage.put(`session:${targetSession}`, history);
        await this.ctx.storage.put(`sessionActivity:${targetSession}`, Date.now());
        
        return new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json" }});
      }
    }

    // --- NEW: BROWSER RENDERING TOOL ---
    // Serve the image directly if the path is /screenshot
    if (url.pathname === "/screenshot") {
      try {
        const targetUrl = url.searchParams.get("url") || "https://github.com/zauguste";
        if (!targetUrl.startsWith("https://github.com/")) {
          return new Response("Only GitHub URLs are allowed", { status: 403 });
        }
        const browser = await puppeteer.launch(this.env.MYBROWSER);
        const page = await browser.newPage();
        await page.goto(targetUrl);
        let img: Buffer;
        const readmeElement = await page.$('#readme');
        if (readmeElement) {
          img = await readmeElement.screenshot() as Buffer;
        } else {
          img = await page.screenshot() as Buffer;
        }
        await browser.close();
        return new Response(img, { headers: { "content-type": "image/png" } });
      } catch (error) {
        return new Response("Error taking screenshot: " + error, { status: 500 });
      }
    }

    if (url.pathname === "/screenshots") {
      const githubUrls = [
        "https://github.com/zauguste",
        "https://github.com/zauguste/my-ai-agent",
        "https://github.com/zauguste/aws-demo-starter-kit",
      ];
      const host = url.origin;
      const imagesHtml = githubUrls.map(u => 
        `<div><h3>${u}</h3><img src="${host}/screenshot?url=${encodeURIComponent(u)}&t=${Date.now()}" style="max-width: 100%; border-radius: 8px; margin-bottom: 20px;" /></div>`
      ).join("");
      const html = `<!DOCTYPE html><html><head><title>GitHub Pages Screenshots</title></head><body style="font-family: sans-serif; padding: 20px;"><h2>GitHub Pages Screenshots</h2>${imagesHtml}</body></html>`;
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }

    if (url.pathname === "/suggestions") {
      const suggestions = [
        "Take a screenshot of his most recent work",
        "What did Zion do during his internship at AWS?",
        "What are Zion's core programming languages?",
        "Tell me about his CyberCyte Security project",
      ];
      return new Response(JSON.stringify(suggestions), { status: 200, headers: { "content-type": "application/json" } });
    }

    // --- FETCH CHAT HISTORY ENDPOINT ---
    if (url.pathname === "/history") {
      let history = await this.ctx.storage.get<any[]>(`session:${sessionId}`) || [];
      const displayHistory = history.filter(msg => msg.role !== 'system');
      return new Response(JSON.stringify(displayHistory), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (userMessage.includes("screenshot")) {
      const host = url.origin;
      const text = `Here is a live screenshot of Zion's current work:<br><br><img src="${host}/screenshot?t=${Date.now()}" alt="Screenshot" style="max-width: 100%; border-radius: 8px;" />`;
      return new Response(text, { status: 200, headers: { "content-type": "text/html" } });
    }

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

    // --- STATE MANAGEMENT (MEMORY) WITH SESSION ID ---
    let history = await this.ctx.storage.get<any[]>(`session:${sessionId}`) || [
      { role: "system", content: systemPrompt }
    ];

    if (history.length > 0 && history[0].role === "system") {
      history[0].content = systemPrompt;
    } else {
      history.unshift({ role: "system", content: systemPrompt });
    }

    if (userMessage) {
      history.push({ role: "user", content: userMessage });
      
      const aiResponse = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        max_tokens: 150, 
        messages: history
      }) as { response?: string, choices?: Array<{message?: {content?: string}}> };

      const text = aiResponse.response ?? aiResponse.choices?.[0]?.message?.content ?? JSON.stringify(aiResponse);

      history.push({ role: "assistant", content: text });

      if (history.length > 11) {
        history = [history[0], ...history.slice(-10)];
      }

      await this.ctx.storage.put(`session:${sessionId}`, history);
      await this.ctx.storage.put(`sessionActivity:${sessionId}`, Date.now());

      return new Response(text, {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }

    return new Response("OK", { status: 200 });
  }
}

// 2. Define the Entry Point (The Router)
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // We continue using one global agent named "portfolio-bot", 
    // but the state inside is now keyed by sessionId.
    const agentId = env.MY_AGENT.idFromName("portfolio-bot");
    const agentStub = env.MY_AGENT.get(agentId);

    let response = await agentStub.fetch(request);
    
    response = new Response(response.body, response);
    response.headers.set("Access-Control-Allow-Origin", "*");
    
    return response;
  }
} satisfies ExportedHandler<Env>;