import { createContext, useReducer, useMemo } from 'react';
import { VIEW_TYPES, DEFAULT_SETTINGS } from '../utils/constants.js';

const initialState = {
  images: { left: null, right: null },
  // 上传时的文件元信息（文件名/尺寸/大小/格式）。
  // 单独一份而不是塞进 images，是因为 images 存的是 Image 元素本身，
  // 元信息要跟着一起清空、一起被导出报告读取。
  imageMeta: { left: null, right: null },
  view: VIEW_TYPES.SLIDER,
  settings: { ...DEFAULT_SETTINGS },
  diffResult: null,
  selectedRegion: null,
  sidebarOpen: true,
  zoom: 1,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        images: { ...state.images, [action.side]: action.image },
        imageMeta: { ...state.imageMeta, [action.side]: action.meta ?? null },
      };

    case 'CLEAR_IMAGES':
      return {
        ...state,
        images: { left: null, right: null },
        imageMeta: { left: null, right: null },
        diffResult: null,
        selectedRegion: null,
      };

    case 'SET_VIEW':
      return { ...state, view: action.view };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.patch },
      };

    case 'RESET_SETTINGS':
      return {
        ...state,
        settings: { ...DEFAULT_SETTINGS },
      };

    case 'SET_DIFF_RESULT':
      return { ...state, diffResult: action.result };

    case 'SET_SELECTED_REGION':
      return { ...state, selectedRegion: action.regionId };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'SET_SIDEBAR':
      return { ...state, sidebarOpen: action.open };

    case 'SET_ZOOM':
      // 缩放值未变时返回原 state，让 React 走 Object.is 短路，
      // 否则画布每次上报（含到达缩放上下限后的空转）都会刷新全部消费者
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };

    default:
      return state;
  }
}

const AppContext = createContext(null);

export { AppContext };

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(() => {
    const dispatchers = {
      setImage: (side, image, meta) => dispatch({ type: 'SET_IMAGE', side, image, meta }),
      clearImages: () => dispatch({ type: 'CLEAR_IMAGES' }),
      setView: (view) => dispatch({ type: 'SET_VIEW', view }),
      updateSettings: (patch) => dispatch({ type: 'UPDATE_SETTINGS', patch }),
      resetSettings: () => dispatch({ type: 'RESET_SETTINGS' }),
      setDiffResult: (result) => dispatch({ type: 'SET_DIFF_RESULT', result }),
      setSelectedRegion: (regionId) =>
        dispatch({ type: 'SET_SELECTED_REGION', regionId }),
      toggleSidebar: () => dispatch({ type: 'TOGGLE_SIDEBAR' }),
      setSidebar: (open) => dispatch({ type: 'SET_SIDEBAR', open }),
      setAppZoom: (zoom) => dispatch({ type: 'SET_ZOOM', zoom }),
    };

    return { state, ...dispatchers };
  }, [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
