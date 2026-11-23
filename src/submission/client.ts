import { requestType, responseType, type PrefillRequest, type PrefillResponse } from './protocol';
import { languageTargets, type SubmissionSnapshot } from './transfer';

export function prefillEditor(snapshot: SubmissionSnapshot, replaceExisting = false): Promise<PrefillResponse['status'] | 'timeout'> {
  const request: PrefillRequest = {
    type: requestType, requestId: crypto.randomUUID(), problemId: snapshot.problemId,
    languageId: languageTargets[snapshot.language].id, code: snapshot.code, replaceExisting
  };
  return new Promise(resolve => {
    let poll: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (status: PrefillResponse['status'] | 'timeout') => {
      clearInterval(poll);
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(status);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const response = event.data as Partial<PrefillResponse> | null;
      if (!response || response.type !== responseType || response.requestId !== request.requestId) return;
      if (response.status && ['applied', 'occupied', 'language-unavailable', 'failed'].includes(response.status)) finish(response.status);
    };
    const send = () => window.postMessage(request, location.origin);
    window.addEventListener('message', onMessage);
    poll = setInterval(send, 150);
    timeout = setTimeout(() => finish('timeout'), 10_000);
    send();
  });
}
