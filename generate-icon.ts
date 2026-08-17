import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

async function generateIcon() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: 'A high-resolution, minimalist app icon design for a Hospital Management System. The design features a stylised medical heartbeat pulse line. Professional colour palette of deep navy blue, crisp white, and medical teal. Flat design with soft rounded corners, suitable for Android, iOS, and Windows taskbars. No text, high contrast, centred on a solid background, professional and clinical aesthetic.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        fs.writeFileSync('public/icon.png', Buffer.from(base64EncodeString, 'base64'));
        console.log('Icon generated successfully!');
      }
    }
  } catch (error) {
    console.error('Error generating icon:', error);
  }
}

generateIcon();
