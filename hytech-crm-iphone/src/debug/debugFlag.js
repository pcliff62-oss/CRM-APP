export const DEBUG_UI = false;

// Minimal hook components can call to decide if debug UI should render
export function useDebugFlag() {
  return DEBUG_UI;
}
