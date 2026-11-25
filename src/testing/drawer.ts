import { defaultLanguage, type CodeLanguage } from '../languages/catalog';
import { Repository } from '../storage/storage';
import { MAX_CASES, readSamples, TestCases, type TestCase } from './cases';

type DrawerTab = 'cases' | 'results';
export interface CaseResult {
  label: string; input: string; expected: string; output: string; error?: string;
  verdict: 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'output';
}
export interface RunResult { language: CodeLanguage; code: string; cases: TestCase[]; results: CaseResult[]; running?: boolean }

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function button(id: string, text: string) {
  const node = element('button', '', text);
  node.id = id;
  node.type = 'button';
  return node;
}

/** One shared drawer. Hiding or switching tabs never destroys cases or run snapshots. */
export class WorkspaceDrawer {
  readonly root = element('section');
  readonly casesButton = button('welcome-baek-cases', '테스트 케이스');
  readonly resultsButton = button('welcome-baek-results', '실행 결과');
  readonly runButton = button('welcome-baek-run', '▷ 코드 실행');
  readonly cases: TestCases;
  private handle = element('div');
  private heading = element('strong');
  private closeButton = button('welcome-baek-drawer-close', '닫기 ×');
  private casesBody = element('div', 'wb-drawer-body');
  private resultsBody = element('div', 'wb-drawer-body');
  private caseList = element('div', 'wb-case-list');
  private input = element('textarea');
  private expected = element('textarea');
  private add = button('welcome-baek-case-add', '＋ 추가');
  private remove = button('welcome-baek-case-remove', '삭제');
  private reset = button('welcome-baek-case-reset', '초기화');
  private empty = element('p', 'wb-empty');
  private fields = element('div', 'wb-case-fields');
  private active: DrawerTab = 'cases';
  private selected = '';
  private opened = false;
  private height = 0;
  private rememberedHeight = 0;
  private drag?: { pointer: number; startY: number; startHeight: number; userSelect: string };
  private result?: RunResult;
  private resultNotice = element('p', 'wb-result-notice');
  private resultList = element('div', 'wb-result-list');
  private resultRows: { card: HTMLDetailsElement; badge: HTMLSpanElement; verdict: HTMLSpanElement;
    content: HTMLDivElement; signature: string }[] = [];
  private language = defaultLanguage;
  private code = '';

  constructor(private panel: HTMLElement, problemRoot: ParentNode, repository: Repository,
    problemId: string, notify: () => void) {
    this.cases = new TestCases(repository, problemId, () => readSamples(problemRoot), () => {
      this.refreshCases();
      this.renderResults();
      notify();
    });
    this.root.id = 'welcome-baek-drawer';
    this.resultNotice.setAttribute('role', 'status');
    this.resultNotice.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-label', '테스트 케이스 및 실행 결과');
    this.handle.id = 'welcome-baek-drawer-handle';
    this.handle.tabIndex = 0;
    this.handle.setAttribute('role', 'separator');
    this.handle.setAttribute('aria-orientation', 'horizontal');
    this.handle.setAttribute('aria-controls', this.root.id);
    this.handle.setAttribute('aria-label', '하단 패널 높이 조절');
    this.handle.title = '위아래로 드래그 · 방향키로 높이 조절 · End로 닫기';
    this.handle.append(element('span', '', '•••'));
    const header = element('div', 'wb-drawer-heading');
    header.append(this.heading, this.closeButton);
    const tools = element('div', 'wb-case-tools');
    this.reset.title = '현재 문제의 테스트 케이스를 백준 예제로 되돌립니다';
    tools.append(this.caseList, this.add, this.reset, this.remove);
    const field = (title: string, textarea: HTMLTextAreaElement) => {
      const label = element('label', '', title);
      textarea.setAttribute('aria-label', title);
      textarea.spellcheck = false;
      textarea.wrap = 'off';
      label.append(textarea);
      return label;
    };
    this.input.id = 'welcome-baek-case-input';
    this.expected.id = 'welcome-baek-case-expected';
    this.input.placeholder = '실행할 때 전달할 입력값';
    this.expected.placeholder = '예상 출력 (선택 사항)';
    this.fields.append(field('입력값', this.input), field('예상 출력', this.expected));
    this.casesBody.append(tools, this.empty, this.fields);
    this.root.append(this.handle, header, this.casesBody, this.resultsBody);
    for (const [control, tab] of [[this.casesButton, 'cases'], [this.resultsButton, 'results']] as const) {
      control.setAttribute('aria-controls', this.root.id);
      control.addEventListener('click', () => {
        if (this.opened && this.active === tab) this.close();
        else this.open(tab);
      });
    }
    this.runButton.disabled = true;
    this.closeButton.addEventListener('click', () => this.close());
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
    });
    this.input.addEventListener('input', () => this.updateCase('input', this.input.value));
    this.expected.addEventListener('input', () => this.updateCase('expected', this.expected.value));
    for (const textarea of [this.input, this.expected]) textarea.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void this.cases.writer?.flush(true);
      }
    });
    this.add.addEventListener('click', () => {
      const writer = this.cases.writer;
      if (!writer || writer.value.length >= MAX_CASES) return;
      this.selected = crypto.randomUUID();
      writer.update([...writer.value, { id: this.selected, input: '', expected: '' }]);
      this.input.focus();
    });
    this.remove.addEventListener('click', () => {
      const writer = this.cases.writer;
      if (writer) writer.update(writer.value.filter(item => item.id !== this.selected));
    });
    this.reset.addEventListener('click', () => {
      const writer = this.cases.writer;
      if (!writer) return;
      this.selected = '';
      writer.update(readSamples(problemRoot));
      void writer.flush();
    });
    this.handle.addEventListener('pointerdown', event => {
      if (!this.opened || this.drag || event.button !== 0) return;
      try { this.handle.setPointerCapture(event.pointerId); } catch { return; }
      event.preventDefault();
      this.drag = { pointer: event.pointerId, startY: event.clientY, startHeight: this.height,
        userSelect: document.body.style.userSelect };
      document.body.style.userSelect = 'none';
      this.root.dataset.dragging = 'true';
    });
    this.handle.addEventListener('pointermove', event => {
      if (!this.drag || event.pointerId !== this.drag.pointer) return;
      this.setHeight(this.drag.startHeight + this.drag.startY - event.clientY);
    });
    this.handle.addEventListener('pointerup', event => {
      if (this.drag?.pointer === event.pointerId) this.finishDrag(true);
    });
    this.handle.addEventListener('pointercancel', () => this.finishDrag(false));
    this.handle.addEventListener('lostpointercapture', () => this.finishDrag(false));
    window.addEventListener('blur', () => this.finishDrag(false));
    this.handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? 50 : 20;
      let next = this.height;
      if (event.key === 'ArrowUp') next += step;
      else if (event.key === 'ArrowDown') next -= step;
      else if (event.key === 'Home') next = this.maximumHeight();
      else if (event.key === 'End') next = 0;
      else return;
      event.preventDefault();
      if (next < 64) this.close();
      else { this.setHeight(next); this.rememberedHeight = this.height; }
    });
    if (typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(() => {
        if (this.opened && !this.drag) this.setHeight(this.height);
      });
      resize.observe(panel);
      const header = panel.querySelector('#welcome-baek-header');
      if (header) resize.observe(header);
    }
    this.refreshCases();
    this.renderResults();
    this.sync();
  }

  private maximumHeight(): number {
    const header = this.panel.querySelector('#welcome-baek-header')?.getBoundingClientRect().height ?? 44;
    const footer = this.panel.querySelector('#welcome-baek-footer')?.getBoundingClientRect().height ?? 48;
    const notice = this.panel.querySelector('#welcome-baek-submit-status')?.getBoundingClientRect().height ?? 0;
    return Math.max(64, Math.min(this.panel.clientHeight * .65,
      this.panel.clientHeight - header - footer - notice - 160));
  }
  private setHeight(value: number) {
    this.height = Math.max(0, Math.min(this.maximumHeight(), value));
    this.root.style.height = `${this.height}px`;
    this.handle.setAttribute('aria-valuemin', '0');
    this.handle.setAttribute('aria-valuemax', String(Math.round(this.maximumHeight())));
    this.handle.setAttribute('aria-valuenow', String(Math.round(this.height)));
    this.root.dataset.snap = String(this.height < 64);
  }
  private finishDrag(commit: boolean) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = undefined;
    document.body.style.userSelect = drag.userSelect;
    this.root.dataset.dragging = 'false';
    if (this.handle.hasPointerCapture?.(drag.pointer)) this.handle.releasePointerCapture(drag.pointer);
    if (!commit) this.setHeight(drag.startHeight);
    if (commit && this.height < 64) this.close();
    else this.rememberedHeight = this.height;
  }
  open(tab: DrawerTab) {
    this.active = tab;
    this.opened = true;
    this.setHeight(this.rememberedHeight || Math.max(180, this.panel.clientHeight * .3));
    this.sync();
  }
  close() {
    this.finishDrag(false);
    if (this.height >= 64) this.rememberedHeight = this.height;
    this.opened = false;
    const focused = this.root.contains(document.activeElement);
    this.setHeight(0);
    this.sync();
    if (focused) (this.active === 'cases' ? this.casesButton : this.resultsButton).focus();
  }
  private sync() {
    this.root.setAttribute('aria-hidden', String(!this.opened));
    this.root.toggleAttribute('inert', !this.opened);
    this.root.dataset.open = String(this.opened);
    this.casesBody.hidden = this.active !== 'cases';
    this.resultsBody.hidden = this.active !== 'results';
    this.heading.textContent = this.active === 'cases' ? '테스트 케이스' : '실행 결과';
    for (const [control, tab] of [[this.casesButton, 'cases'], [this.resultsButton, 'results']] as const) {
      control.setAttribute('aria-expanded', String(this.opened && this.active === tab));
      control.dataset.active = String(this.opened && this.active === tab);
    }
  }
  private updateCase(key: 'input' | 'expected', value: string) {
    const writer = this.cases.writer;
    if (writer) writer.update(writer.value.map(item => item.id === this.selected ? { ...item, [key]: value } : item));
  }
  private refreshCases() {
    const items = this.cases.writer?.value ?? [];
    if (!items.some(item => item.id === this.selected)) this.selected = items[0]?.id ?? '';
    this.caseList.replaceChildren(...items.map((item, index) => {
      const control = button('', `케이스 ${index + 1}`);
      control.removeAttribute('id');
      control.setAttribute('aria-pressed', String(item.id === this.selected));
      control.addEventListener('click', () => { this.selected = item.id; this.refreshCases(); });
      return control;
    }));
    const current = items.find(item => item.id === this.selected);
    // Avoid resetting the caret or IME composition while an autosave status changes.
    if (this.input.value !== (current?.input ?? '')) this.input.value = current?.input ?? '';
    if (this.expected.value !== (current?.expected ?? '')) this.expected.value = current?.expected ?? '';
    this.input.disabled = this.expected.disabled = !current;
    this.fields.hidden = !current;
    this.add.disabled = !this.cases.writer || items.length >= MAX_CASES;
    this.remove.disabled = !current;
    this.reset.disabled = !this.cases.writer;
    this.empty.hidden = !!current;
    this.empty.textContent = this.cases.error ? '테스트 케이스를 불러오지 못했습니다. 상단의 재시도를 눌러 주세요.'
      : !this.cases.writer ? '테스트 케이스 불러오는 중…' : '테스트 케이스가 없습니다. 새 케이스를 추가하거나 초기화를 눌러 주세요.';
  }
  get selectedCaseIndex(): number {
    return this.cases.writer?.value.findIndex(item => item.id === this.selected) ?? -1;
  }
  setContext(language: CodeLanguage, code: string) {
    this.language = language;
    this.code = code;
    this.renderResults();
  }
  setResult(result: RunResult, reveal = true) {
    this.result = structuredClone(result);
    if (reveal) {
      this.resultRows = [];
      this.resultList.replaceChildren();
    }
    this.renderResults();
    if (reveal) this.open('results');
  }
  private renderResults() {
    if (!this.result) {
      this.resultsBody.replaceChildren(element('p', 'wb-empty', '아직 실행 결과가 없습니다.'),
        element('p', 'wb-muted', '테스트 케이스를 실행하면 여기에 결과가 표시됩니다.'));
      return;
    }
    const result = this.result;
    const stale = result.language !== this.language || result.code !== this.code ||
      JSON.stringify(result.cases) !== JSON.stringify(this.cases.writer?.value ?? []);
    const complete = result.results.filter(row => row.verdict !== 'queued' && row.verdict !== 'running').length;
    const progress = result.running ? `테스트 실행 중 · ${complete}/${result.results.length} 완료` : '마지막 실행 결과';
    this.resultNotice.textContent = stale
      ? `${progress} · 코드·언어 또는 테스트 케이스가 변경되었습니다. 이전 실행 결과입니다.` : progress;
    if (this.resultList.parentElement !== this.resultsBody) {
      this.resultsBody.replaceChildren(this.resultNotice, this.resultList);
    }
    const names = { queued: '대기 중', running: '실행 중', passed: '통과', failed: '실패', error: '오류', output: '출력 확인' };
    result.results.forEach((row, index) => {
      let record = this.resultRows[index];
      if (!record) {
        const card = element('details', 'wb-result');
        const summary = element('summary', 'wb-result-summary');
        const badge = element('span', 'wb-result-badge');
        const verdict = element('span', 'wb-result-verdict');
        const content = element('div', 'wb-result-content');
        summary.append(badge, ' ', verdict);
        card.append(summary, content);
        this.resultList.append(card);
        record = this.resultRows[index] = { card, badge, verdict, content, signature: '' };
      }
      const signature = JSON.stringify(row);
      if (record.signature === signature) return;
      record.signature = signature;
      record.card.dataset.verdict = row.verdict;
      record.card.setAttribute('aria-busy', String(row.verdict === 'running'));
      record.badge.textContent = row.label;
      record.verdict.textContent = names[row.verdict];
      const pending = row.verdict === 'queued' || row.verdict === 'running';
      const fields = [['입력값', row.input], ['예상 출력', row.expected],
        ...(!pending ? [['실제 출력', row.output]] : []),
        ...(row.error ? [['오류 내용', row.error]] : [])].map(([name, value]) => {
        const field = element('div');
        field.append(element('strong', '', name), element('pre', '', value));
        return field;
      });
      // Keep the card and summary in place so expanded results, focus and scroll survive updates.
      record.content.replaceChildren(...fields, ...(pending ? [element('p', 'wb-muted',
        row.verdict === 'queued' ? '실행 순서를 기다리고 있습니다.' : '컴파일 및 실행 중입니다.')] : []));
    });
    while (this.resultRows.length > result.results.length) {
      this.resultRows.pop()!.card.remove();
    }
  }
}
