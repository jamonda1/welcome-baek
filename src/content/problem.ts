
import { createEditor, type EditorTheme } from '../editor/editor';
import { javaRunnerAvailable, runJava } from '../java/client';
import { defaultLanguage, isCodeLanguage, languageOrder, languages, type CodeLanguage } from '../languages/catalog';
import { templates } from '../languages/templates';
import { Repository, storageError, type Preferences } from '../storage/storage';
import { BufferedValue, Drafts } from '../storage/persistence';
import { openSubmission, type SubmissionSnapshot } from '../submission/transfer';
import { WorkspaceDrawer, type CaseResult } from '../testing/drawer';

const main = document.querySelector<HTMLElement>(
  '.container.content'
);

const problemId = /^\/problem\/(\d+)\/?$/.exec(location.pathname)?.[1];

if (problemId && main && !document.querySelector('#welcome-baek-layout')) {
  const repository = new Repository();
  const drafts = new Drafts(repository, problemId, language => templates[language], renderStatus);
  const preferences = new Map<keyof Preferences, BufferedValue<Preferences[keyof Preferences]>>();
  let initialized = false;
  let currentLanguage = defaultLanguage;
  let loading = true;
  let loadError: unknown;
  let loadVersion = 0;
  let previousStatus = '';
  let compactSaved = false;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let runningJava = false;
  let preparingSubmission = false;
  let submissionNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  // ========================================
  // 전체 분할 레이아웃
  // ========================================

  const layout = document.createElement('div');
  layout.id = 'welcome-baek-layout';

  main.classList.add('welcome-baek-problem');
  main.tabIndex = 0;
  main.setAttribute('aria-label', '백준 문제');

  // ========================================
  // Welcome Baek 패널
  // ========================================

  const panel = document.createElement('aside');
  panel.id = 'welcome-baek-panel';
  panel.dataset.theme = 'github-light';
  panel.setAttribute('aria-label', 'Welcome Baek 코드 편집기');

  const editorHeader = document.createElement('div');
  editorHeader.id = 'welcome-baek-header';

  const title = document.createElement('h2');
  title.textContent = 'Welcome Baek';
  title.className = 'welcome-baek-sr-only';

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

  for (const language of languageOrder) {
    const option = document.createElement('option');
    option.value = language;
    option.textContent = languages[language].label;
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

  const submitButton = document.createElement('button');
  submitButton.id = 'welcome-baek-submit';
  submitButton.type = 'button';
  submitButton.textContent = '코드 제출';
  submitButton.title = '현재 코드를 새 탭의 백준 제출 화면으로 가져오기';
  const editorFooter = document.createElement('div');
  editorFooter.id = 'welcome-baek-footer';
  const submitStatus = document.createElement('div');
  submitStatus.id = 'welcome-baek-submit-status';
  submitStatus.setAttribute('role', 'status');
  submitStatus.setAttribute('aria-live', 'polite');
  submitStatus.hidden = true;
  const saveInfo = document.createElement('div');
  saveInfo.id = 'welcome-baek-save-info';
  const saveHint = document.createElement('span');
  saveHint.id = 'welcome-baek-save-hint';
  saveHint.textContent = 'Ctrl+S / ⌘+S';
  saveHint.title = '마지막 입력 0.5초 후 자동 저장 · 에디터에서 Ctrl+S / ⌘+S로 즉시 저장';
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
  status.title = '마지막 입력 0.5초 후 자동 저장 · Ctrl+S / ⌘+S로 즉시 저장';
  saveInfo.append(status, retryButton, saveHint);
  controls.append(languageSelect, saveInfo, themeSelect);
  editorHeader.append(title, controls);

  // ========================================
  // CodeMirror 에디터 영역
  // ========================================

  const editorContainer = document.createElement('div');
  editorContainer.id = 'welcome-baek-editor';

  const drawer = new WorkspaceDrawer(panel, main, repository, problemId, renderStatus);
  editorFooter.append(drawer.casesButton, drawer.resultsButton, drawer.runButton, submitButton);
  panel.append(editorHeader, editorContainer, drawer.root, submitStatus, editorFooter);

  // ========================================
  // 중앙 구분선
  // ========================================

  // Keep the button outside the separator so both controls remain accessible.
  const dividerControls = document.createElement('div');
  dividerControls.id = 'welcome-baek-divider-controls';
  const divider = document.createElement('div');
  divider.id = 'welcome-baek-divider';

  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.tabIndex = -1;
  divider.setAttribute('aria-valuemin', '20');
  divider.setAttribute('aria-valuemax', '80');
  divider.setAttribute('aria-controls', 'welcome-baek-panel');
  divider.title = '드래그 또는 방향키로 화면 비율 조절';
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

  divider.append(dividerHandle);
  dividerControls.append(divider, swapButton);

  // ========================================
  // 레이아웃 상태
  // ========================================

  let problemRatio = 50;
  let reversed = false;
  let dragging = false;
  let dragPointer: number | undefined;
  let previousUserSelect = '';

  const updateLayout = () => {
    main.style.flexGrow = String(problemRatio);
    panel.style.flexGrow = String(100 - problemRatio);
    // Border-box bases keep the saved ratio accurate despite different pane padding.
    main.style.flexBasis = `calc((100% - 12px) * ${problemRatio / 100})`;
    panel.style.flexBasis = `calc((100% - 12px) * ${(100 - problemRatio) / 100})`;
    divider.setAttribute('aria-valuenow', String(Math.round(problemRatio)));
    divider.setAttribute('aria-valuetext', `문제 ${Math.round(problemRatio)}%, 코드 ${Math.round(100 - problemRatio)}%`);
  };

  const updateOrder = () => {
    // Keep DOM nodes in place: moving a focused CodeMirror detaches its selection.
    layout.dataset.reversed = String(reversed);
    swapButton.setAttribute('aria-pressed', String(reversed));
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
    if (!initialized || dragging || event.button !== 0) return;
    try { divider.setPointerCapture(event.pointerId); } catch { return; }
    event.preventDefault();
    dragging = true;
    dragPointer = event.pointerId;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
  });

  // ========================================
  // 드래그 중 화면 비율 변경
  // ========================================

  divider.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== dragPointer) return;

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
    if (!dragging) return;
    dragging = false;
    dragPointer = undefined;
    document.body.style.userSelect = previousUserSelect;
    void preferences.get('problemRatio')?.flush();
  };

  divider.addEventListener('pointerup', stopDragging);
  divider.addEventListener('pointercancel', stopDragging);
  divider.addEventListener('lostpointercapture', stopDragging);
  window.addEventListener('blur', stopDragging);
  divider.addEventListener('keydown', event => {
    if (!initialized) return;
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') problemRatio += reversed ? step : -step;
    else if (event.key === 'ArrowRight') problemRatio += reversed ? -step : step;
    else if (event.key === 'Home') problemRatio = 20;
    else if (event.key === 'End') problemRatio = 80;
    else return;
    event.preventDefault();
    problemRatio = Math.max(20, Math.min(80, problemRatio));
    updateLayout();
    setPreference('problemRatio', problemRatio);
  });

  // ========================================
  // 레이아웃 삽입
  // ========================================

  main.before(layout);
  layout.append(main, dividerControls, panel);
  updateOrder();
  updateLayout();
  const fitWorkspace = () => {
    const offset = `${Math.max(0, Math.round(layout.getBoundingClientRect().top))}px`;
    if (layout.style.getPropertyValue('--wb-top') !== offset) layout.style.setProperty('--wb-top', offset);
  };
  fitWorkspace();
  window.addEventListener('resize', fitWorkspace);
  const siteHeader = document.querySelector('.header');
  if (siteHeader && typeof ResizeObserver !== 'undefined') new ResizeObserver(fitWorkspace).observe(siteHeader);

  // ========================================
  // CodeMirror 생성 및 이벤트 연결
  // ========================================

  const editor = createEditor(editorContainer, {
    onChange(code) {
      if (!loading) drafts.entries.get(currentLanguage)?.update(code);
      drawer.setContext(currentLanguage, code);
    },
    onSave: saveCurrent
  });

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    preferences.get(key)?.update(value);
  }

  function allWriters() {
    return [...drafts.entries.values(), ...preferences.values(), ...(drawer.cases.writer ? [drawer.cases.writer] : [])];
  }
  function renderStatus() {
    const writers = allWriters();
    const failed = writers.find(writer => writer.state === 'error');
    const saving = writers.some(writer => writer.state === 'saving');
    const pending = writers.some(writer => writer.dirty);
    const nextStatus = loadError || drawer.cases.error || failed ? 'error' : loading ? 'loading' : saving ? 'saving' : pending ? 'pending'
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
      : drawer.cases.error ? `테스트 케이스 불러오기 실패: ${storageError(drawer.cases.error)}`
      : failed ? `저장 실패 (코드·설정·테스트 케이스): ${storageError(failed.error)}`
      : loading ? '코드 불러오는 중…'
      : saving ? '저장 중…' : pending ? '변경 사항 있음'
      : nextStatus === 'saved' ? compactSaved ? '✓ 저장됨' : '✓ 저장되었습니다' : '자동 저장 사용 중';
    retryButton.hidden = !loadError && !drawer.cases.error && !failed;
    languageSelect.disabled = !initialized;
    themeSelect.disabled = !initialized;
    swapButton.disabled = !initialized;
    divider.tabIndex = initialized ? 0 : -1;
    divider.setAttribute('aria-disabled', String(!initialized));
    const canRunJava = currentLanguage === 'java' && javaRunnerAvailable();
    drawer.runButton.disabled = !canRunJava || loading || runningJava ||
      !drawer.cases.writer?.value.length || !editor.view.state.doc.toString().trim();
    drawer.runButton.textContent = runningJava ? 'Java 실행 중…' : '▷ 코드 실행';
    drawer.runButton.title = !canRunJava ? '현재 로컬 실행은 Java만 지원합니다'
      : '선택한 테스트 케이스를 Java 11로 실행합니다';
    submitButton.disabled = loading || !initialized || preparingSubmission || !editor.view.state.doc.toString().trim();
    submitButton.title = !editor.view.state.doc.toString().trim()
      ? '코드를 작성하면 제출 페이지로 이동할 수 있습니다' : '현재 코드를 새 탭의 백준 제출 화면으로 가져오기';
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
      drawer.setContext(language, draft.value);
      loading = false;
    } catch (error) {
      if (version !== loadVersion) return;
      loadError = error;
    }
    renderStatus();
  }

  function flushAll() {
    return Promise.all(allWriters().map(writer => writer.flush()));
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
      panel.dataset.theme = settings.theme;
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
    const language = languageSelect.value;
    if (!isCodeLanguage(language)) return;
    // The outgoing writer keeps its own key and in-memory draft even if saving fails.
    void flushAll();
    setPreference('language', language);
    void showLanguage(language);
  });

  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value as EditorTheme;
    editor.setTheme(theme);
    panel.dataset.theme = theme;
    setPreference('theme', theme);
  });

  retryButton.addEventListener('click', () => {
    void flushAll();
    if (drawer.cases.error) void drawer.cases.load();
    if (!initialized) void initialize();
    else if (loadError) void showLanguage(currentLanguage);
  });
  drawer.runButton.addEventListener('click', async () => {
    if (drawer.runButton.disabled) return;
    const cases = structuredClone(drawer.cases.writer!.value);
    const index = drawer.selectedCaseIndex;
    const selected = cases[index];
    if (!selected) return;
    const code = editor.view.state.doc.toString();
    runningJava = true;
    renderStatus();
    try {
      const result = await runJava({ source: code, input: selected.input });
      const normalize = (value: string) => value.replace(/\r\n/g, '\n').trimEnd();
      const verdict = result.error ? 'error' : selected.expected === '' ? 'output'
        : normalize(result.output) === normalize(selected.expected) ? 'passed' : 'failed';
      drawer.setResult({ language: 'java', code, cases, results: [
        { ...result, verdict, input: selected.input, expected: selected.expected, label: `케이스 ${index + 1}` }
      ] });
    } catch (error) {
      const result: CaseResult = { verdict: 'error', output: '', input: selected.input, expected: selected.expected,
        label: `케이스 ${index + 1}`, error: error instanceof Error ? error.message : 'Java 실행 환경을 열지 못했습니다.' };
      drawer.setResult({ language: 'java', code, cases, results: [result] });
    } finally {
      runningJava = false;
      renderStatus();
    }
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
    clearTimeout(submissionNoticeTimer);
    submitStatus.hidden = false;
    submitStatus.dataset.state = 'loading';
    submitStatus.textContent = '제출할 코드를 준비하는 중…';
    submitButton.textContent = '준비 중…';
    renderStatus();
    void openSubmission(snapshot, () => draft.flush(true)).then(() => {
      submitStatus.dataset.state = 'success';
      submitStatus.textContent = '제출 화면을 열었습니다. 새 탭에서 언어와 코드를 확인해 주세요.';
      submissionNoticeTimer = setTimeout(() => { submitStatus.hidden = true; }, 4000);
    }).catch((error: unknown) => {
      submitStatus.dataset.state = 'error';
      submitStatus.textContent = error instanceof Error && !/quota|context invalidated/i.test(error.message)
        ? error.message : storageError(error);
    }).finally(() => {
      preparingSubmission = false;
      submitButton.textContent = '코드 제출';
      renderStatus();
    });
  });

  // Unload cannot await promises. Start writes early and warn while anything is unsaved.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAll();
  });
  window.addEventListener('pagehide', () => { void flushAll(); });
  window.addEventListener('beforeunload', event => {
    if (allWriters().some(writer => writer.dirty)) {
      void flushAll();
      event.preventDefault();
      event.returnValue = '';
    }
  });
  void initialize();
  void drawer.cases.load();
}
