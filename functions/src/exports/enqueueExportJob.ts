import type { CloudTasksClient } from '@google-cloud/tasks';

// Loaded on first enqueue, not at import: every function loads the whole index,
// and @google-cloud/tasks (~23 MB) is only needed by the export callables.
let client: CloudTasksClient | null = null;
async function getClient(): Promise<CloudTasksClient> {
  if (!client) {
    const { CloudTasksClient: Client } = await import('@google-cloud/tasks');
    client = new Client();
  }
  return client;
}

const QUEUE_LOCATION = 'us-central1';
const QUEUE_NAME = 'exports';

export async function enqueueExportJob(jobId: string): Promise<string> {
  const client = await getClient();
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
  const parent = client.queuePath(project, QUEUE_LOCATION, QUEUE_NAME);

  const url = `https://${QUEUE_LOCATION}-${project}.cloudfunctions.net/runExportJob`;

  const [response] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
        oidcToken: {
          serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
          audience: url,
        },
      },
    },
  });

  const taskName = response.name || '';
  console.log(`[enqueueExportJob] Created task: ${taskName} for job: ${jobId}`);
  return taskName;
}
