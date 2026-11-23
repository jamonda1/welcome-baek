import { languages } from '../languages/catalog';
import { prefillEditor } from '../submission/client';
import { clearTabTransfer, discardTransfer, readTransfer, submissionToken, transferParameter } from '../submission/transfer';
import { storageError } from '../storage/storage';

const problemId = /^\/submit\/(\d+)\/?$/.exec(location.pathname)?.[1];
const token = problemId ? submissionToken(problemId) : null;

if (problemId && token && !document.querySelector('#welcome-baek-import')) {
  const panel = document.createElement('section');
  panel.id = 'welcome-baek-import';
  panel.setAttribute('aria-label', 'Welcome Baek 코드 가져오기');
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '다시 가져오기';
  retry.hidden = true;
  const replace = document.createElement('button');
  replace.type = 'button';
  replace.textContent = '기존 코드 대신 가져오기';
  replace.hidden = true;
  const settings = document.createElement('a');
  settings.href = '/setting/language';
  settings.target = '_blank';
  settings.rel = 'noopener noreferrer';
  settings.textContent = '백준 언어 설정';
  settings.hidden = true;
  panel.append(message, retry, replace, settings);
  const form = document.querySelector('#submit_form');
  if (form) form.before(panel);
  else (document.querySelector('.container.content') ?? document.body).prepend(panel);
  let busy = false;

  async function importCode(replaceExisting = false) {
    if (busy) return;
    busy = true;
    retry.hidden = replace.hidden = settings.hidden = true;
    panel.dataset.state = 'loading';
    message.textContent = 'Welcome Baek: 코드를 가져오는 중…';
    try {
      const snapshot = await readTransfer(token!, problemId!);
      const result = await prefillEditor(snapshot, replaceExisting);
      if (result === 'applied') {
        panel.dataset.state = 'success';
        const language = document.createElement('strong');
        language.textContent = '언어';
        const visibility = document.createElement('strong');
        visibility.textContent = '공개 범위';
        message.replaceChildren(
          `Welcome Baek: ${languages[snapshot.language].submission.label} 코드를 가져왔습니다. 제출 전 `,
          language, '와 ', visibility, '를 확인해주세요.'
        );
        // Do not apply the snapshot again when the user refreshes after editing.
        clearTabTransfer(problemId!, token!);
        const url = new URL(location.href);
        if (url.searchParams.has(transferParameter)) {
          url.searchParams.delete(transferParameter);
          history.replaceState(history.state, '', url.href);
        }
        try { await discardTransfer(token!); } catch { /* Expired copies are pruned on the next handoff. */ }
      } else {
        panel.dataset.state = 'error';
        if (result === 'occupied') {
          message.textContent = 'Welcome Baek: 제출 화면에 이미 코드가 있습니다. 내용을 확인하고 가져오기 여부를 선택해 주세요.';
          replace.hidden = false;
        } else if (result === 'language-unavailable') {
          message.textContent = `Welcome Baek: 현재 백준 언어 목록에 ${languages[snapshot.language].submission.label}이 없습니다. 언어 설정에서 추가한 뒤 이 페이지를 새로고침해 주세요.`;
          settings.hidden = retry.hidden = false;
        } else {
          message.textContent = result === 'timeout'
            ? 'Welcome Baek: 백준 코드 입력기 준비를 확인하지 못했습니다. 잠시 후 다시 가져오기를 눌러 주세요.'
            : 'Welcome Baek: 코드 입력을 완료하지 못했습니다. 현재 내용을 확인하고 다시 가져오기를 눌러 주세요.';
          retry.hidden = false;
        }
      }
    } catch (error) {
      panel.dataset.state = 'error';
      message.textContent = `Welcome Baek: ${storageError(error)}`;
      retry.hidden = false;
    } finally {
      busy = false;
    }
  }
  retry.addEventListener('click', () => { void importCode(); });
  replace.addEventListener('click', () => { void importCode(true); });
  void importCode();
}
