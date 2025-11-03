// Lightweight Mapware provider client placeholder.
// Fill in real API endpoints and payloads when credentials and docs are available.

export type MapwareStartParams = {
  images: string[];
  callbackUrl: string;
  projectName?: string;
  apiKey: string;
  apiBase?: string; // e.g. https://api.mapware.com
};

export type MapwareStartResult = {
  externalJobId: string;
  submitResponse?: any;
};

export async function startMapwareJob(params: MapwareStartParams): Promise<MapwareStartResult> {
  const { images, callbackUrl, projectName, apiKey, apiBase } = params;

  // TODO: Replace with real Mapware submission call.
  // This placeholder returns a mock job id so the UI can proceed to RUNNING state.
  // When wiring the real API, keep the return shape stable.
  const externalJobId = `mapware_${Date.now()}`;

  // Example (pseudo):
  // const res = await fetch(`${apiBase || 'https://api.mapware.com'}/v1/projects`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${apiKey}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ name: projectName || 'HyTech Mission', images, webhookUrl: callbackUrl })
  // });
  // const data = await res.json();
  // return { externalJobId: data.id, submitResponse: data };

  return { externalJobId };
}
