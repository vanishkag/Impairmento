import 'dotenv/config';
import { genkit, z } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { startFlowsServer } from '@genkit-ai/flow';

// 1. Initialize Genkit
const ai = genkit({
  plugins: [googleAI()], // Automatically uses process.env.GEMINI_API_KEY
});

// 2. Define the schema for incoming data
const SignInputSchema = z.object({
  videoDataUrl: z.string().describe('Base64 data URL of the webm video clip'),
  workspaceContext: z.string().describe('Active text/UI from the Chrome Extension'),
});

// 3. Define the Genkit Flow
export const translateSignFlow = ai.defineFlow(
  {
    name: 'translateSignFlow',
    inputSchema: SignInputSchema,
    outputSchema: z.object({
      translation: z.string()
    }),
  },
  async (input) => {
    const prompt = `
      You are an expert enterprise sign language interpreter.
      
      ### ACTIVE WORKSPACE CONTEXT:
      ${input.workspaceContext}
      
      ### INSTRUCTIONS:
      1. Watch the attached video clip carefully.
      2. Interpret the enterprise intent.
      3. Use the ACTIVE WORKSPACE CONTEXT to disambiguate pronouns.
      4. Output ONLY a clear, concise English enterprise command.
    `;

    const response = await ai.generate({
      model: gemini15Flash,
      prompt: [
        { text: prompt },
        { media: { url: input.videoDataUrl } }
      ],
      config: { temperature: 0.2 }
    });

    return { 
      translation: response.text
    };
  }
);

// 4. Start the Genkit Flow Server
startFlowsServer();