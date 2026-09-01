To deploy use npm run deploy.
Use npm run dev to start your development environment.




Overview of how the agent works.

It uses a durable object to remember. It is stateful and have their own persistent storage. 

MyCustomAgent is a Durable Object. It uses a built-in storage this.ctx.storage.get("history") and this.ctx.storage.put("history", history)) to save the conversation. This gives the agent the ability to "remember" what was said earlier in the chat and maintain continuous conversation with the user.


In this project the user's message hits the router :
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
The durable object is then called to get the users past conversation history and adds the new message to it.

The worker AI is the brain and the durable object gives the whole conversation to the AI model so it can generate an intelligent response for the user.

... brace yourself
When the response is given the ai agent  gives the message to the durable object and it saves the message in memory. 
The durable object gives the message to the router. 
The router finally gives the message to the user.
