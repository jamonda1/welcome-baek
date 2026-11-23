
import { createEditor } from '../editor/editor';

const main = document.querySelector<HTMLElement>(
  '.container.content'
);

if (main && !document.querySelector('#welcome-baek-layout')) {
  // 전체 분할 레이아웃
  const layout = document.createElement('div');
  layout.id = 'welcome-baek-layout';

  // 백준 문제 영역
  main.classList.add('welcome-baek-problem');

  // Welcome Baek 영역
  const panel = document.createElement('aside');
  panel.id = 'welcome-baek-panel';

  const title = document.createElement('h2');
  title.textContent = 'Welcome Baek';

  // CodeMirror 에디터 컨테이너
  const editorContainer = document.createElement('div');
  editorContainer.id = 'welcome-baek-editor';

  panel.append(title, editorContainer);

  // 중앙 구분선
  const divider = document.createElement('div');
  divider.id = 'welcome-baek-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', '화면 분할 비율 조절');

  // 좌우 반전 버튼
  const swapButton = document.createElement('button');
  swapButton.id = 'welcome-baek-swap';
  swapButton.type = 'button';
  swapButton.textContent = '⇄';
  swapButton.title = '백준과 Welcome Baek 위치 바꾸기';
  swapButton.setAttribute('aria-label', swapButton.title);

  // 버튼 클릭 시 드래그 시작 방지
  swapButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  // Grip Handle
  const dividerHandle = document.createElement('div');
  dividerHandle.id = 'welcome-baek-divider-handle';
  dividerHandle.setAttribute('aria-hidden', 'true');

  // 점 6개 (2열 × 3행)
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('span');
    dot.className = 'welcome-baek-divider-dot';
    dividerHandle.appendChild(dot);
  }

  divider.append(swapButton, dividerHandle);

  // 레이아웃 상태
  let problemRatio = 50;
  let reversed = false;
  let dragging = false;

  // 화면 비율 갱신
  const updateLayout = () => {
    main.style.flexGrow = String(problemRatio);
    panel.style.flexGrow = String(100 - problemRatio);
  };

  // 좌우 배치 변경
  const updateOrder = () => {
    if (reversed) {
      layout.append(panel, divider, main);
    } else {
      layout.append(main, divider, panel);
    }
  };

  // 좌우 반전
  swapButton.addEventListener('click', (event) => {
    event.stopPropagation();

    reversed = !reversed;
    updateOrder();
    updateLayout();
  });

  // 드래그 시작
  divider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    dragging = true;
    divider.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
  });

  // 드래그 중 비율 변경
  divider.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const rect = layout.getBoundingClientRect();
    const usableWidth = rect.width - divider.offsetWidth;

    if (usableWidth <= 0) return;

    const offset =
      event.clientX - rect.left - divider.offsetWidth / 2;

    const leftRatio = Math.max(
      20,
      Math.min(80, (offset / usableWidth) * 100)
    );

    // 좌우 반전 상태에서도 백준 영역 비율 유지
    problemRatio = reversed
      ? 100 - leftRatio
      : leftRatio;

    updateLayout();
  });

  // 드래그 종료
  const stopDragging = () => {
    dragging = false;
    document.body.style.userSelect = '';
  };

  divider.addEventListener('pointerup', stopDragging);
  divider.addEventListener('pointercancel', stopDragging);
  divider.addEventListener('lostpointercapture', stopDragging);

  // 페이지에 레이아웃 삽입
  main.before(layout);
  updateOrder();
  updateLayout();

  // CodeMirror 에디터 생성
  createEditor(editorContainer);
}
