type AgentCashJsonInput = {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
};

export async function agentcashJson<T>(input: AgentCashJsonInput): Promise<T> {
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(input.body),
  });

  if (!response.ok) {
    throw new Error(`AgentCash call failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
