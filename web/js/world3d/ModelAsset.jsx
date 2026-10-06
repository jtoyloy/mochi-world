import React, { useMemo, useEffect, useRef, Suspense, Component } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
class AssetBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Model({ kind, color, animation = "idle" }) {
  const asset = useGLTF("/assets/models/" + kind + ".glb"),
    model = useMemo(() => {
      const s = clone(asset.scene);
      s.traverse((m) => {
        if (m.isMesh) {
          m.material = m.material.clone();
          m.material.color.set(color);
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return s;
    }, [asset.scene, color]),
    mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  useEffect(() => {
    const clip =
      asset.animations.find((c) => c.name === animation) ?? asset.animations[0];
    const action = clip && mixer.clipAction(clip);
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [animation, mixer, asset.animations]);
  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      model.traverse((m) => {
        if (m.isMesh) m.material.dispose();
      });
    },
    [model, mixer],
  );
  useFrame((_, dt) => mixer.update(dt), -3);
  return <primitive object={model} />;
}
export function ModelAsset(props) {
  return (
    <AssetBoundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Model {...props} />
      </Suspense>
    </AssetBoundary>
  );
}
