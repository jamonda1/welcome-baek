import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const activeReviewStates = ['PENDING_REVIEW', 'STAGED', 'PUBLISHED_TO_TESTERS'];
const maxStatusChecks = 30;
const statusCheckIntervalMs = 5_000;

async function publish() {
  const { CWS_ACCESS_TOKEN, CWS_PUBLISHER_ID, CWS_ITEM_ID, GITHUB_REF_NAME } = process.env;
  const packagePath = process.argv[2];
  if (!CWS_ACCESS_TOKEN || !CWS_PUBLISHER_ID || !CWS_ITEM_ID || !GITHUB_REF_NAME || !packagePath) {
    throw new Error('Set the Chrome Web Store access token, publisher ID, item ID and release tag, and provide the ZIP path.');
  }

  const version = GITHUB_REF_NAME.slice(1);
  const item = 'publishers/' + encodeURIComponent(CWS_PUBLISHER_ID) + '/items/' + encodeURIComponent(CWS_ITEM_ID);
  const endpoint = 'https://chromewebstore.googleapis.com';
  const statusPath = '/v2/' + item + ':fetchStatus';

  async function request(path, options = {}) {
    const response = await fetch(endpoint + path, {
      ...options,
      headers: { ...options.headers, Authorization: 'Bearer ' + CWS_ACCESS_TOKEN },
      redirect: 'error',
      signal: AbortSignal.timeout(45_000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      const detail = result?.error?.message ?? response.statusText;
      throw new Error(path.split(':').at(-1) + ' returned HTTP ' + response.status + ': ' + detail);
    }
    return result;
  }

  const status = await request(statusPath);
  const published = status.publishedItemRevisionStatus;
  if (published?.distributionChannels?.some(channel => channel.crxVersion === version)) {
    console.log('Chrome Web Store already published version', version);
    return;
  }

  const submitted = status.submittedItemRevisionStatus;
  if (activeReviewStates.includes(submitted?.state)) {
    const alreadyInReview = submitted.state === 'PENDING_REVIEW'
      && submitted.distributionChannels?.some(channel => channel.crxVersion === version);
    if (alreadyInReview) {
      console.log('Chrome Web Store already has version', version, 'in review.');
      return;
    }
    throw new Error('Resolve the active submission in the Chrome Web Store Developer Dashboard before retrying.');
  }
  if (status.lastAsyncUploadState === 'IN_PROGRESS') {
    throw new Error('A previous upload is still processing. Retry after it completes.');
  }

  const upload = await request('/upload/v2/' + item + ':upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: await readFile(packagePath)
  });

  let uploadState = upload.uploadState;
  for (let attempt = 0; uploadState === 'IN_PROGRESS' && attempt < maxStatusChecks; attempt += 1) {
    await setTimeout(statusCheckIntervalMs);
    uploadState = (await request(statusPath)).lastAsyncUploadState;
  }

  if (uploadState !== 'SUCCEEDED' || (upload.crxVersion && upload.crxVersion !== version)) {
    throw new Error('Could not verify upload of version ' + version + ' (state: ' + (uploadState ?? 'unknown') + ').');
  }

  const submission = await request('/v2/' + item + ':publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false })
  });

  console.log('Chrome Web Store accepted version', version, 'for publication. State:', submission.state);
}

try {
  await publish();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
