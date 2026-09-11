import { createContext, useReducer, useMemo } from 'react';
import { VIEW_TYPES, DEFAULT_SETTINGS } from '../utils/constants.js';

const initialState = {
  images: { left: null, right: null },
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
      };

    case 'CLEAR_IMAGES':
      return {
        ...state,
        images: { left: null, right: null },
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
      return { ...state, zoom: action.zoom };

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
      setImage: (side, image) => dispatch({ type: 'SET_IMAGE', side, image }),
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
