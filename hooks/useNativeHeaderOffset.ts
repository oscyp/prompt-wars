import { useContext } from 'react';
import { HeaderHeightContext } from '@react-navigation/elements';

/** iOS keyboard coordinates are screen-relative; an opaque stack header is outside the form. */
export function useNativeHeaderOffset() {
  return useContext(HeaderHeightContext) ?? 0;
}
