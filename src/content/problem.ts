
import {
  createEditor,
  templates,
  type CodeLanguage,
  type EditorTheme
} from '../editor/editor';
import { Repository, storageError, type Preferences } from '../storage/storage';
import { BufferedValue, Drafts } from '../storage/persistence';
import { openSubmission, type SubmissionSnapshot } from '../submission/transfer';

const main = document.querySelector<HTMLElement>(
  '.container.content'
);

const problemId = /^\/problem\/(\d+)\/?$/.exec(location.pathname)?.[1];

if (problemId && main && !document.querySelector('#welcome-baek-layout')) {
  const repository = new Repository();
  const drafts = new Drafts(repository, problemId, language => templates[language], renderStatus);
  const preferences = new Map<keyof Preferences, BufferedValue<Preferences[keyof Preferences]>>();
  let initialized = false;
  let currentLanguage: CodeLanguage = 'java';
  let loading = true;
  let loadError: unknown;
  let loadVersion = 0;
  let previousStatus = '';
  let compactSaved = false;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let preparingSubmission = false;
  // ========================================
  // 전체 분할 레이아웃
  // ========================================

  const layout = document.createElement('div');
  layout.id = 'welcome-baek-layout';

  main.classList.add('welcome-baek-problem');

  // ========================================
  // Welcome Baek 패널
  // ========================================

  const panel = document.createElement('aside');
  panel.id = 'welcome-baek-panel';

  const editorHeader = document.createElement('div');
  editorHeader.id = 'welcome-baek-header';

  const title = document.createElement('h2');
  title.textContent = 'Welcome Baek';

  // 상단 선택 메뉴 컨테이너
  const controls = document.createElement('div');
  controls.id = 'welcome-baek-controls';

  // ========================================
  // 언어 선택
  // ========================================

  const languageSelect = document.createElement('select');
  languageSelect.id = 'welcome-baek-language';
  languageSelect.setAttribute(
    'aria-label',
    '프로그래밍 언어 선택'
  );

  const languages: {
    value: CodeLanguage;
    label: string;
  }[] = [
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'python', label: 'Python' }
  ];

  for (const language of languages) {
    const option = document.createElement('option');
    option.value = language.value;
    option.textContent = language.label;
    languageSelect.appendChild(option);
  }

  // ========================================
  // 테마 선택
  // ========================================

  const themeSelect = document.createElement('select');
  themeSelect.id = 'welcome-baek-theme';
  themeSelect.setAttribute(
    'aria-label',
    '에디터 테마 선택'
  );

  const themes: {
    value: EditorTheme;
    label: string;
  }[] = [
    { value: 'github-light', label: 'GitHub Light' },
    { value: 'one-dark', label: 'One Dark' },
    { value: 'dracula', label: 'Dracula' }
  ];

  for (const theme of themes) {
    const option = document.createElement('option');
    option.value = theme.value;
    option.textContent = theme.label;
    themeSelect.appendChild(option);
  }

  controls.append(languageSelect, themeSelect);
  const submitButton = document.createElement('button');
  submitButton.id = 'welcome-baek-submit';
  submitButton.type = 'button';
  submitButton.textContent = '제출 페이지로 이동';
  submitButton.title = '현재 코드를 새 탭의 백준 제출 화면으로 가져오기';
  controls.append(submitButton);
  const submitStatus = document.createElement('div');
  submitStatus.id = 'welcome-baek-submit-status';
  submitStatus.setAttribute('role', 'status');
  submitStatus.setAttribute('aria-live', 'polite');
  submitStatus.hidden = true;
  const saveInfo = document.createElement('div');
  saveInfo.id = 'welcome-baek-save-info';
  const saveHint = document.createElement('span');
  saveHint.id = 'welcome-baek-save-hint';
  saveHint.textContent = '자동 저장 · 에디터에서 Ctrl+S / ⌘+S로 즉시 저장';
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.id = 'welcome-baek-retry';
  retryButton.textContent = '재시도';
  retryButton.hidden = true;
  const status = document.createElement('div');
  status.id = 'welcome-baek-save-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  saveInfo.append(saveHint, status, retryButton);
  editorHeader.append(title, controls, saveInfo);

  // ========================================
  // CodeMirror 에디터 영역
  // ========================================

  const editorContainer = document.createElement('div');
  editorContainer.id = 'welcome-baek-editor';

  panel.append(editorHeader, submitStatus, editorContainer);

  // ========================================
  // 중앙 구분선
  // ========================================

  const divider = document.createElement('div');
  divider.id = 'welcome-baek-divider';

  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute(
    'aria-label',
    '화면 분할 비율 조절'
  );

  // 좌우 반전 버튼
  const swapButton = document.createElement('button');
  swapButton.id = 'welcome-baek-swap';
  swapButton.type = 'button';
  swapButton.textContent = '⇄';
  swapButton.title = '백준과 Welcome Baek 위치 바꾸기';
  swapButton.setAttribute('aria-label', swapButton.title);

  swapButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  // ========================================
  // Grip Handle
  // ========================================

  const dividerHandle = document.createElement('div');
  dividerHandle.id = 'welcome-baek-divider-handle';
  dividerHandle.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('span');
    dot.className = 'welcome-baek-divider-dot';
    dividerHandle.appendChild(dot);
  }

  divider.append(swapButton, dividerHandle);

  // ========================================
  // 레이아웃 상태
  // ========================================

  let problemRatio = 50;
  let reversed = false;
  let dragging = false;

  const updateLayout = () => {
    main.style.flexGrow = String(problemRatio);
    panel.style.flexGrow = String(100 - problemRatio);
  };

  const updateOrder = () => {
    if (reversed) {
      layout.append(panel, divider, main);
    } else {
      layout.append(main, divider, panel);
    }
  };

  // ========================================
  // 좌우 반전
  // ========================================

  swapButton.addEventListener('click', (event) => {
    event.stopPropagation();

    reversed = !reversed;
    updateOrder();
    updateLayout();
    setPreference('reversed', reversed);
  });

  // ========================================
  // 드래그 시작
  // ========================================

  divider.addEventListener('pointerdown', (event) => {
    if (!initialized || event.button !== 0) return;

    dragging = true;
    divider.setPointerCapture(event.pointerId);

    document.body.style.userSelect = 'none';
  });

  // ========================================
  // 드래그 중 화면 비율 변경
  // ========================================

  divider.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const rect = layout.getBoundingClientRect();
    const usableWidth =
      rect.width - divider.offsetWidth;

    if (usableWidth <= 0) return;

    const offset =
      event.clientX -
      rect.left -
      divider.offsetWidth / 2;

    const leftRatio = Math.max(
      20,
      Math.min(
        80,
        (offset / usableWidth) * 100
      )
    );

    problemRatio = reversed
      ? 100 - leftRatio
      : leftRatio;

    updateLayout();
    setPreference('problemRatio', problemRatio);
  });

  // ========================================
  // 드래그 종료
  // ========================================

  const stopDragging = () => {
    dragging = false;
    document.body.style.userSelect = '';
    void preferences.get('problemRatio')?.flush();
  };

  divider.addEventListener('pointerup', stopDragging);
  divider.addEventListener('pointercancel', stopDragging);
  divider.addEventListener('lostpointercapture', stopDragging);

  // ========================================
  // 레이아웃 삽입
  // ========================================

  main.before(layout);
  updateOrder();
  updateLayout();

  // ========================================
  // CodeMirror 생성 및 이벤트 연결
  // ========================================

  const editor = createEditor(editorContainer, {
    onChange(code) {
      if (!loading) drafts.entries.get(currentLanguage)?.update(code);
    },
    onSave: saveCurrent
  });

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    preferences.get(key)?.update(value);
  }

  function renderStatus() {
    const writers = [...drafts.entries.values(), ...preferences.values()];
    const failed = writers.find(writer => writer.state === 'error');
    const saving = writers.some(writer => writer.state === 'saving');
    const pending = writers.some(writer => writer.dirty);
    const nextStatus = loadError || failed ? 'error' : loading ? 'loading' : saving ? 'saving' : pending ? 'pending'
      : writers.some(writer => writer.state === 'saved') ? 'saved' : 'ready';
    if (nextStatus !== previousStatus) {
      clearTimeout(statusTimer);
      compactSaved = false;
      previousStatus = nextStatus;
      if (nextStatus === 'saved') {
        statusTimer = setTimeout(() => {
          compactSaved = true;
          renderStatus();
        }, 2500);
      }
    }
    status.dataset.state = nextStatus;
    status.textContent = loadError ? `불러오기 실패: ${storageError(loadError)}`
      : failed ? `저장 실패 (다른 언어·설정 포함): ${storageError(failed.error)}`
      : loading ? '코드 불러오는 중…'
      : saving ? '저장 중…' : pending ? '변경 사항 있음'
      : nextStatus === 'saved' ? compactSaved ? '✓ 저장됨' : '✓ 저장되었습니다' : '자동 저장 사용 중';
    retryButton.hidden = !loadError && !failed;
    languageSelect.disabled = !initialized;
    themeSelect.disabled = !initialized;
    swapButton.disabled = !initialized;
    submitButton.disabled = loading || !initialized || preparingSubmission;
    editorContainer.setAttribute('aria-busy', String(loading));
  }

  async function showLanguage(language: CodeLanguage) {
    const version = ++loadVersion;
    currentLanguage = language;
    loading = true;
    loadError = undefined;
    editor.showDocument(language, '', false);
    renderStatus();
    try {
      const draft = await drafts.load(language);
      if (version !== loadVersion) return;
      editor.showDocument(language, draft.value);
      loading = false;
    } catch (error) {
      if (version !== loadVersion) return;
      loadError = error;
    }
    renderStatus();
  }

  function flushAll() {
    return Promise.all([...drafts.entries.values(), ...preferences.values()].map(writer => writer.flush()));
  }

  function saveCurrent() {
    if (loading || !initialized) return;
    void drafts.entries.get(currentLanguage)?.flush(true);
    // Retry any failed outgoing language and preference saves, too.
    void flushAll();
  }

  async function initialize() {
    loading = true;
    loadError = undefined;
    renderStatus();
    try {
      const settings = await repository.readPreferences();
      for (const key of Object.keys(settings) as (keyof Preferences)[]) {
        preferences.set(key, new BufferedValue<Preferences[keyof Preferences]>(settings[key],
          value => repository.writePreference(key, value), renderStatus));
      }
      problemRatio = settings.problemRatio;
      reversed = settings.reversed;
      languageSelect.value = settings.language;
      themeSelect.value = settings.theme;
      editor.setTheme(settings.theme);
      updateOrder();
      updateLayout();
      initialized = true;
      await showLanguage(settings.language);
    } catch (error) {
      loadError = error;
      renderStatus();
    }
  }

  languageSelect.addEventListener('change', () => {
    const language = languageSelect.value as CodeLanguage;
    // The outgoing writer keeps its own key and in-memory draft even if saving fails.
    void flushAll();
    setPreference('language', language);
    void showLanguage(language);
  });

  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value as EditorTheme;
    editor.setTheme(theme);
    setPreference('theme', theme);
  });

  retryButton.addEventListener('click', () => {
    void flushAll();
    if (!initialized) void initialize();
    else if (loadError) void showLanguage(currentLanguage);
  });
  submitButton.addEventListener('click', () => {
    if (loading || preparingSubmission || !initialized) return;
    const draft = drafts.entries.get(currentLanguage);
    if (!draft) return;
    // Capture code and language before asynchronous saves or another language switch.
    const snapshot: SubmissionSnapshot = {
      problemId, language: currentLanguage, code: editor.view.state.doc.toString(), createdAt: Date.now()
    };
    preparingSubmission = true;
    submitStatus.hidden = false;
    submitStatus.dataset.state = 'loading';
    submitStatus.textContent = '제출할 코드를 준비하는 중…';
    submitButton.textContent = '준비 중…';
    renderStatus();
    void openSubmission(snapshot, () => draft.flush(true)).then(() => {
      submitStatus.dataset.state = 'success';
      submitStatus.textContent = '제출 화면을 열었습니다. 새 탭에서 언어와 코드를 확인해 주세요.';
    }).catch((error: unknown) => {
      submitStatus.dataset.state = 'error';
      submitStatus.textContent = error instanceof Error && !/quota|context invalidated/i.test(error.message)
        ? error.message : storageError(error);
    }).finally(() => {
      preparingSubmission = false;
      submitButton.textContent = '제출 페이지로 이동';
      renderStatus();
    });
  });

  // Unload cannot await promises. Start writes early and warn while anything is unsaved.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAll();
  });
  window.addEventListener('pagehide', () => { void flushAll(); });
  window.addEventListener('beforeunload', event => {
    if ([...drafts.entries.values(), ...preferences.values()].some(writer => writer.dirty)) {
      void flushAll();
      event.preventDefault();
      event.returnValue = '';
    }
  });
  void initialize();
}
