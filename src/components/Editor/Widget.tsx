import {defineComponent, onMounted, ref, PropType, computed, h, watch, reactive} from "vue";
import {Widget, WidgetAnimateClass} from "../../store/types";
import {useStore} from "../../store";
import Dot from './Dot/index';
import {Direct, DotInfo, DotMouseDownInfo, DragStartInfo, MoveStartInfo, WidgetMoveData} from "./types";
import {emitter} from "./bus";
import {stretchStrategy} from "./stretch";
import {calculateDotInfo} from "./Dot/dot";
import {getPoint} from "../../utils";
import RotateDot from './RotateDot';
import {stopClick} from "../../uses/stopClick";
import {properBase} from "../../uses/propertyBase";
import { cloneDeep } from 'lodash';

export default defineComponent({
  name: 'WidgetBox',
  props: {
    info: {
      type: Object as PropType<Widget>,
      required: true
    }
  },
  setup(props, { slots }) {
    const root = ref<HTMLElement | null>(null);
    let startInfo: DragStartInfo | null = null;
    const dots = ref<DotInfo[]>([]);
    const store = properBase().store;
    const currentSnapshot = properBase().currentSnapshot;
    const activeWidget = properBase().widget;
    let moving = false;
    const isActive = computed(() => !!activeWidget);
    const setActive = () => {
      store.commit('editor/setActivateWidgetId', props.info.id);
      generateDots();
    }

    const toggleMoving = (movable: boolean) => {
      if (movable) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      } else {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    }

    const handleMousedown = (event: MouseEvent) => {
      // console.log('event', event.target);
      event.preventDefault();
      startInfo = {
        x: event.clientX,
        y: event.clientY,
        left: root.value!.offsetLeft, // left和top第一次等于props.info.position
        top: root.value!.offsetTop
      };
      root.value!.style.zIndex = '2';
      emitter.emit<string>('press', props.info.id);
      setActive();
      toggleMoving(true);
    }

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault();
      moving = true;
      const diffX = event.clientX - startInfo!.x;
      const diffY = event.clientY - startInfo!.y;
      const { left, top } = calculate(diffX, diffY);
      root.value!.style.top = top + 'px';
      root.value!.style.left = left + 'px';
      emitter.emit<WidgetMoveData>('move', {
        dom: root.value!,
        style: { ...props.info.widgetStyle, left, top }
      });
    }
    const handleMouseUp = () => {
      toggleMoving(false);
      if (moving) {
        root.value!.style.zIndex = '1';
        store.commit('editor/setWidgetStyle', {
          id: props.info.id,
          value: {
            left: root.value!.offsetLeft,
            top: root.value!.offsetTop
          }
        });
        // console.log('activeWidget', activeWidget.value);
        setSnapshot();
        moving = false;
        emitter.emit<void>('up');
      }
    }

    const setSnapshot = () => {
      const newSnapshot = cloneDeep(currentSnapshot.value);
      const activeInSnapshotIndex = newSnapshot.findIndex(item => item.id === activeWidget.value!.id);
      // console.log('newSnapshot', newSnapshot, activeInSnapshotIndex);
      if (activeInSnapshotIndex > -1) {
        newSnapshot.splice(activeInSnapshotIndex, 1, cloneDeep(activeWidget.value!));
      }
      // console.log('newSnapshot', newSnapshot);
      store.dispatch('addSnapshot', newSnapshot);
    }

    const calculate = (diffX: number, diffY: number): { left: number; top: number } => {
      let newLeft = startInfo!.left + diffX;
      let newTop = startInfo!.top + diffY;
      return {
        left: newLeft,
        top: newTop
      };
    }

    let dotMousedownInfo: DotMouseDownInfo;

    const handleDotDown = (type: string) => {
      // step1: handlePoint旋转后的坐标
      const { widgetStyle } = props.info;
      const center = {
        x: widgetStyle.left + (widgetStyle.width / 2),
        y: widgetStyle.top + (widgetStyle.height / 2)
      }
      const handlePoint = getPoint(widgetStyle, center, type);
     /* const sPoint = {
        x: center.x + Math.abs(handlePoint.x - center.x) * (handlePoint.x < center.x ? 1 : -1),
        y: center.y + Math.abs(handlePoint.y - center.y) * (handlePoint.y < center.y ? 1 : -1)
      }*/
      const sPoint = {
        x: center.x - (handlePoint.x - center.x),
        y: center.y - (handlePoint.y - center.y)
      }
      dotMousedownInfo = { handlePoint, center, sPoint }
      // console.log('dotMousedownInfo', dotMousedownInfo);
    }

    const handleDotMove = (type: string, position: MoveStartInfo) => {
      stretchStrategy[type](dotMousedownInfo, props.info.widgetStyle, position, root.value!, () => generateDots());
    }

    const handleDotUp = () => {
      store.commit('editor/setWidgetStyle', {
        id: props.info.id,
        value: {
          width: root.value!.clientWidth,
          height: root.value!.clientHeight,
          top: root.value!.offsetTop,
          left: root.value!.offsetLeft
        }
      });
    }


    const generateDots = () => {
      const width = root.value!.clientWidth;
      const height = root.value!.clientHeight;
      dots.value = [];
      Object.entries(Direct).forEach(([type, value]) => {
        dots.value.push(calculateDotInfo(type, value, width, height, props.info.widgetStyle.rotate));
      });
    }

    const renderDots = () => {
      return dots.value.map(item => {
        return h(Dot, {
          info: item,
          onDown: handleDotDown.bind(null, item.type),
          onMove: handleDotMove.bind(null, item.type),
          onUp: handleDotUp
        });
      });
    }

    const handleRotateDotMove = (rotate: number) => {
      // console.log('handleRotateDotMove', rotate);
      root.value!.style.transform = 'rotate(' + rotate + 'deg)';
      root.value!.setAttribute('data-rotate', rotate.toString());
    }

    const handleRotateDotUp = () => {
      // console.log('handleRotateDotUp', root.value!.dataset.rotate);
      const { widgetStyle, ...rest } = props.info;
      store.commit('editor/setWidgetStyle', {
        id: props.info.id,
        value: {
          rotate: +(root.value!.dataset.rotate || 0)
        }
      });
    }

    watch(() => props.info.widgetStyle.opacity, opacity => {
      root.value!.style.opacity = opacity.toString();
    });
    watch(() => props.info.animateClass, cls => {
      setCls(cls);
    });

    const setCls = (cls: Partial<WidgetAnimateClass>) => {
      [cls.animate, cls.speed].filter(Boolean).forEach(item => {
        root.value!.classList.add('animate__' + item!);
      });
    }

    const refresh = () => {
      root.value!.style.left = props.info.widgetStyle.left + 'px';
      root.value!.style.top = props.info.widgetStyle.top + 'px';
      root.value!.style.width = props.info.widgetStyle.width + 'px';
      root.value!.style.height = props.info.widgetStyle.height + 'px';
      root.value!.style.transform = `rotate(${props.info.widgetStyle.rotate}deg)`;
      root.value!.style.opacity = props.info.widgetStyle.opacity.toString();
      root.value!.style.zIndex = '1';
      setCls(props.info.animateClass);
    }

    watch(() => props.info, info => {
      console.log('wat info', info);
    });

    onMounted(() => {
      refresh();
      root.value!.addEventListener('animationend', function() {
        const active = isActive.value ? ' active' : '';
        this.className = 'widget animate__animated' + active;
      });
    });

    return () => {
      return (
        <div class={{
          widget: true,
          animate__animated: true,
          active: isActive.value
        }} ref={ root } onClick={ stopClick } onMousedown={ handleMousedown }>
          <RotateDot
            widgetStyle={ props.info.widgetStyle }
            v-show={ isActive.value }
            // @ts-ignore
            onMove={ handleRotateDotMove }
            onUp={ handleRotateDotUp }
          />
          { isActive.value ? renderDots() : null }
          { slots.default!() }
        </div>
      );
    }
  }
})
