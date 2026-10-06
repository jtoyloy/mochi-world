import React, { createContext, useContext } from "react";
import { Html } from "@react-three/drei";
export const LabelPortalContext = createContext(null);
// Separate DOM layer: React's Canvas fallback cannot remove projected label nodes.
export function WorldHtml(props) {
  const portal = useContext(LabelPortalContext);
  return <Html portal={portal} {...props} />;
}
