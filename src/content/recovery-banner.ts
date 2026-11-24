export function createRecoveryBanner(readCode: () => string | undefined, reload: () => void) {
  const root = document.createElement('div');
  root.id = 'welcome-baek-recovery';
  root.hidden = true;

  const heading = document.createElement('strong');
  heading.textContent = '이 탭의 자동 저장이 중단됐어요.';
  const message = document.createElement('div');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-atomic', 'true');

  const copyButton = document.createElement('button');
  copyButton.id = 'welcome-baek-recovery-copy';
  copyButton.type = 'button';
  copyButton.textContent = '코드 복사';
  const reloadButton = document.createElement('button');
  reloadButton.id = 'welcome-baek-recovery-reload';
  reloadButton.type = 'button';
  reloadButton.textContent = '페이지 새로고침';
  const description = document.createElement('div');
  description.append(heading, message);
  root.append(description, copyButton, reloadButton);

  let copiedCode: string | undefined;
  let copying = false;
  let copyFailed = false;

  function refresh() {
    const code = readCode();
    const copied = code !== undefined && code === copiedCode;
    copyButton.hidden = code === undefined;
    copyButton.disabled = copying;
    reloadButton.disabled = copying || (code !== undefined && !copied);

    const text = code === undefined ? '페이지를 새로고침해 편집기를 다시 연결해 주세요.'
      : copying ? '코드를 복사하는 중…'
      : copyFailed ? '복사하지 못했어요. 다시 시도하거나 편집기에서 직접 복사해 주세요.'
      : copied ? '코드가 복사됐어요. 새로고침 후 필요한 코드를 붙여넣어 주세요.'
      : '작성한 코드를 복사한 뒤 페이지를 새로고침해 주세요.';
    if (message.textContent !== text) message.textContent = text;
  }

  copyButton.addEventListener('click', async () => {
    const code = readCode();
    if (code === undefined || copying) return;
    copiedCode = undefined;
    copying = true;
    copyFailed = false;
    refresh();
    try {
      await navigator.clipboard.writeText(code);
      copiedCode = code;
    } catch {
      copyFailed = true;
    } finally {
      copying = false;
      refresh();
    }
  });

  reloadButton.addEventListener('click', () => {
    refresh();
    if (!reloadButton.disabled) reload();
  });

  return { root, refresh };
}
