export interface ChatMessage {
  role: 'user' | 'model' | 'system' | 'assistant';
  content: string;
}

export interface AiClientOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export async function generateChatResponse(
  messages: ChatMessage[],
  options: AiClientOptions
) {
  const { baseUrl, model, apiKey = "none" } = options;

  const formattedMessages = messages.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.content
  }));

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: formattedMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: Failed to generate response.`);
    }

    const data = await response.json();
    const textResponse = data.choices?.[0]?.message?.content || "";
    return textResponse;

  } catch (error) {
    console.error("AI Generation Error:", error);
    throw error;
  }
}

/**
 * Streams LLM response and calls onChunk with each text delta.
 * Returns the full accumulated text when done.
 */
export async function streamChatResponse(
  messages: ChatMessage[],
  options: AiClientOptions,
  onChunk: (chunk: string, fullText: string) => void
): Promise<string> {
  const { baseUrl, model, apiKey = "none" } = options;

  const formattedMessages = messages.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.content
  }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: formattedMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          onChunk(delta, fullText);
        }
      } catch (_) { /* skip parse errors */ }
    }
  }

  return fullText;
}

export async function generateTTSAudio(text: string, apiKey: string): Promise<string | null> {
    try {
        const ttsResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: { text },
                voice: { languageCode: 'en-US', name: 'en-US-Journey-F' },
                audioConfig: { audioEncoding: 'MP3' }
            })
        });

        if (!ttsResponse.ok) {
             console.error("TTS Error:", await ttsResponse.text());
             return null;
        }

        const ttsData = await ttsResponse.json();
        return ttsData.audioContent;

    } catch (e) {
        console.error("TTS Fetch Error:", e);
        return null;
    }
}

export async function transcribeAudio(base64Audio: string, apiKey: string): Promise<string | null> {
    try {
        const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                config: {
                    encoding: 'WEBM_OPUS',
                    sampleRateHertz: 48000,
                    languageCode: 'en-US',
                },
                audio: { content: base64Audio }
            })
        });

        if (!response.ok) {
             console.error("STT Error:", await response.text());
             return null;
        }

        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const transcript = data.results.map((r: any) => r.alternatives[0].transcript).join(' ');
            return transcript;
        }
        return null;

    } catch (e) {
        console.error("STT Fetch Error:", e);
        return null;
    }
}
