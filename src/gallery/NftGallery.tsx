"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
import {
  prefetchGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getGalleryPanelConfig,
  getCurrentNftSource,
  getAllPanelTokenSources,
  onGalleryConfigReady,
  updatePanelIndex,
} from '@/gallery/galleryConfig';
import { PERSONAL_LAYOUT, getPersonalPanelPlacements } from '@/gallery/layouts/galleryLayouts';
import { personalPanelKey } from '@/lib/personal-gallery';
import {
  prefetchGalleryPanelCache,
  getCachedGalleryMetadata,
  getCachedGalleryMetadataBatch,
  getPrewarmedGalleryMetadata,
  waitForGalleryCachedMetadata,
  prewarmGalleryMetadataCache,
} from '@/lib/gallery-cache';
import { getGatewayCandidates } from '@/lib/gallery-fetcher/urlUtils';
import type { NftSource, NftMetadata } from '@/lib/gallery-fetcher/nftFetcher';
import { createGifTexture } from '@/lib/gallery-fetcher/gifTexture';
import { MarketBrowserRefined } from '@/components/gallery/MarketBrowserRefined';
import { isGalleryTokenMinted } from '@/lib/gallery-minted-token-ids';
import { toast } from 'sonner';

RectAreaLightUniformsLib.init();

const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;
const ROOM_SEGMENT_SIZE = 10;
const NUM_SEGMENTS = 5;
const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
const WALL_HEIGHT = 16;
const LOWER_WALL_HEIGHT = 8;
const LOWER_PANEL_Y = 5.0;
const INNER_LOWER_PANEL_Y = 4.0;
const UPPER_PANEL_Y = 12.0;
const WALL_THICKNESS = 0.5;
const BOUNDARY = ROOM_SIZE / 2 - 1.0;
const PANEL_LOAD_CONCURRENCY = 12;
const SPLASH_FALLBACK_MS = 8000;

interface Panel {
  mesh: THREE.Mesh;
  wallName: string;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

interface NftGalleryProps {
  layout?: 'main' | 'personal';
  roomId?: string;
  roomDisplayName?: string;
  onLoadingProgress?: (progress: number) => void;
  onLoadingMessage?: (message: string) => void;
  onLoadingComplete?: () => void;
  onFirstImageLoaded?: () => void;
  isWalking: boolean;
  setIsWalking: (walking: boolean) => void;
}

const rainbowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rainbowFragmentShader = `
  varying vec2 vUv;
  uniform float time;
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  void main() {
    float hue = fract(time * 0.08 + vUv.x * 0.5 + vUv.y * 0.5);
    vec3 color = hsv2rgb(vec3(hue, 0.9, 0.9));
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    gl_FragColor = vec4(color * vignette, 1.0);
  }
`;

const isVideoContent = (contentType: string, url: string) =>
  !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));

const isGifContent = (contentType: string, url: string) =>
  !!(contentType === 'image/gif' || url.match(/\.gif(\?|$)/i));

const disposeTextureSafely = (mesh: THREE.Mesh) => {
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    const mat = material as THREE.MeshBasicMaterial & { map: THREE.Texture | null };
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    mat.dispose();
  }
};

function createProceduralTable() {
  const group = new THREE.Group();
  const mahoganyMat = new THREE.MeshStandardMaterial({ 
    color: 0x4A1C1C, 
    roughness: 0.6, 
    metalness: 0.1 
  });
  const chromeMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    metalness: 1.0, 
    roughness: 0.1 
  });
  
  const topGeo = new THREE.BoxGeometry(2.4, 0.08, 1.4);
  const top = new THREE.Mesh(topGeo, mahoganyMat);
  top.position.y = 0.8;
  group.add(top);

  const supportGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
  const support = new THREE.Mesh(supportGeo, chromeMat);
  support.position.y = 0.4;
  group.add(support);

  const baseGeo = new THREE.BoxGeometry(1.6, 0.05, 1.0);
  const base = new THREE.Mesh(baseGeo, mahoganyMat);
  base.position.y = 0.025;
  group.add(base);

  return group;
}

function createDiamondTeleporter() {
  const group = new THREE.Group();
  const diamondGeo = new THREE.OctahedronGeometry(0.8, 0);
  const diamondMat = new THREE.MeshPhysicalMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.5,
    metalness: 0.1,
    roughness: 0,
    transmission: 0.8,
    thickness: 1,
    emissive: 0x0044ff,
    emissiveIntensity: 0.2
  });
  const diamond = new THREE.Mesh(diamondGeo, diamondMat);
  diamond.name = "diamondBody";
  group.add(diamond);

  const edges = new THREE.EdgesGeometry(diamondGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
  const etchings = new THREE.LineSegments(edges, lineMat);
  diamond.add(etchings);

  const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const light = new THREE.PointLight(0x00ffff, 3, 5);
  group.add(light);

  const createElectron = (radius: number, color: number) => {
    const eGroup = new THREE.Group();
    const eGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eMat = new THREE.MeshBasicMaterial({ color: color });
    const electron = new THREE.Mesh(eGeo, eMat);
    electron.position.x = radius;
    eGroup.add(electron);
    return eGroup;
  };

  const electron1 = createElectron(1.3, 0x00ffff);
  electron1.rotation.z = Math.PI / 4;
  group.add(electron1);

  const electron2 = createElectron(1.5, 0xff00ff);
  electron2.rotation.x = Math.PI / 3;
  group.add(electron2);

  group.userData = { 
    isTeleportButton: true,
    electron1,
    electron2,
    diamond
  };

  return group;
}

const NftGallery: React.FC<NftGalleryProps> = ({
  layout = 'main',
  roomId,
  roomDisplayName: _roomDisplayName,
  onLoadingProgress,
  onLoadingMessage,
  onLoadingComplete,
  onFirstImageLoaded,
  isWalking,
  setIsWalking: _setIsWalking,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const teleportButtonsRef = useRef<THREE.Group[]>([]);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });
  const [webglError, setWebglError] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Use a Ref to hold the walk state so that updating it doesn't recreate the 3D scene
  const isWalkingRef = useRef(isWalking);
  const onLoadingProgressRef = useRef(onLoadingProgress);
  const onLoadingMessageRef = useRef(onLoadingMessage);
  const onLoadingCompleteRef = useRef(onLoadingComplete);
  const onFirstImageLoadedRef = useRef(onFirstImageLoaded);
  const loadingCompleteCalledRef = useRef(false);
  const firstImageReportedRef = useRef(false);

  // Keep refs in sync with props without re-initializing the 3D scene.
  useEffect(() => {
    isWalkingRef.current = isWalking;
  }, [isWalking]);

  useEffect(() => {
    onLoadingProgressRef.current = onLoadingProgress;
  }, [onLoadingProgress]);

  useEffect(() => {
    onLoadingMessageRef.current = onLoadingMessage;
  }, [onLoadingMessage]);

  useEffect(() => {
    onLoadingCompleteRef.current = onLoadingComplete;
  }, [onLoadingComplete]);

  useEffect(() => {
    onFirstImageLoadedRef.current = onFirstImageLoaded;
  }, [onFirstImageLoaded]);

  // Keyboard movement keys states
  const keysPressed = useRef({
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  });

  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif = isGifContent(contentType, url);
    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.src = '';
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }
    if (isGif) {
      const { texture, stop } = await createGifTexture(url);
      panel.gifStopFunction = stop;
      return texture;
    }
    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.src = url;
      panel.videoElement = videoEl;
      return new THREE.VideoTexture(videoEl);
    }
    return new Promise((resolve, reject) => {
      const candidates = getGatewayCandidates(url);
      let index = 0;
      const tryNext = () => {
        if (index >= candidates.length) {
          reject(new Error(`Failed to load texture: ${url}`));
          return;
        }
        const candidate = candidates[index++];
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(candidate, resolve, undefined, tryNext);
      };
      tryNext();
    });
  }, []);

  const applyPanelFromMetadata = useCallback(async (panel: Panel, metadata: NftMetadata) => {
    if (panel.metadataUrl) return;
    try {
      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType || '', metadata.contentUrl);
      panel.isGif = isGifContent(metadata.contentType || '', metadata.contentUrl);
      const config = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = config && config.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    } catch (e) {
      console.error(e);
    }
  }, [loadTexture]);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    panel.metadataUrl = '';
    if (!source || source.contractAddress === '') return;

    let metadata =
      getPrewarmedGalleryMetadata(source.contractAddress, source.tokenId) ??
      (await getCachedGalleryMetadata(source.contractAddress, source.tokenId));
    if (!metadata) {
      metadata = await waitForGalleryCachedMetadata(source.contractAddress, source.tokenId);
    }
    if (!metadata) return;

    await applyPanelFromMetadata(panel, metadata);
  }, [applyPanelFromMetadata]);

  const performTeleport = (targetY: number) => {
    if (isTeleportingRef.current) return;
    isTeleportingRef.current = true;
    fadeStartTimeRef.current = performance.now();
    setTimeout(() => {
      if (cameraRef.current) cameraRef.current.position.y = targetY;
    }, FADE_DURATION * 1000);
  };

  const isPersonal = layout === 'personal' && !!roomId;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    if (layoutRef.current === 'personal') {
      if (Math.abs(pos.x) > PERSONAL_LAYOUT.boundaryX || Math.abs(pos.z) > PERSONAL_LAYOUT.boundaryZ) {
        return true;
      }
      return false;
    }
    if (Math.abs(pos.x) > BOUNDARY || Math.abs(pos.z) > BOUNDARY) return true;
    if (pos.y < 5) {
      const padding = 0.8;
      const wallThick = 0.25 + padding;
      const wallHalfLen = 5.0 + padding;
      const crossPoints = [-10, 10];
      const innerBoundary = 5.0;
      for (const cp of crossPoints) {
        if (Math.abs(pos.z - (-innerBoundary)) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
        if (Math.abs(pos.z - innerBoundary) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
      }
      for (const cp of crossPoints) {
        if (Math.abs(pos.x - innerBoundary) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
        if (Math.abs(pos.x - (-innerBoundary)) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    if (layout === 'personal' && !roomId) return;
    loadingCompleteCalledRef.current = false;
    setWebglError(null);

    const galleryInit = { layout, roomId: roomId ?? null } as const;
    const panelCachePromise = prefetchGalleryPanelCache(
      layout === 'personal' && roomId ? { roomId } : {},
    );
    const configPromise = prefetchGalleryConfig(galleryInit);

    // Full detail on desktop; lighter settings on mobile for performance.
    const highQuality = !window.matchMedia('(max-width: 768px)').matches;

    const mountEl = mountRef.current;
    const getViewportSize = () => ({
      width: Math.max(1, mountEl.clientWidth),
      height: Math.max(1, mountEl.clientHeight),
    });

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);
    const { width: initialWidth, height: initialHeight } = getViewportSize();
    const camera = new THREE.PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1.6, isPersonal ? 14 : 20);
    camera.rotation.order = 'YXZ';

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: highQuality,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebGL is unavailable in this browser.';
      setWebglError(message);
      onLoadingCompleteRef.current?.();
      return;
    }

    if (!renderer.getContext()) {
      setWebglError('WebGL is unavailable in this browser.');
      renderer.dispose();
      onLoadingCompleteRef.current?.();
      return;
    }

    rendererRef.current = renderer;
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, highQuality ? 1.5 : 1));
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mountEl.appendChild(canvas);

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });

    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide
    });

    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();

    if (isPersonal) {
      const { roomWidth, roomDepth, wallHeight, pitWidth, pitDepth, pitDepthY, wallThickness } = PERSONAL_LAYOUT;
      const halfW = roomWidth / 2;
      const halfD = roomDepth / 2;
      const halfWall = wallHeight / 2;

      hemiLight.position.set(0, wallHeight, 0);

      const northSouthWallGeo = new THREE.BoxGeometry(roomWidth + wallThickness, wallHeight, wallThickness);
      const eastWestWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, roomDepth + wallThickness);

      const northWall = new THREE.Mesh(northSouthWallGeo, wallMaterial.clone());
      northWall.position.set(0, halfWall, -halfD);
      scene.add(northWall);

      const southWall = new THREE.Mesh(northSouthWallGeo, wallMaterial.clone());
      southWall.position.set(0, halfWall, halfD);
      scene.add(southWall);

      const eastWall = new THREE.Mesh(eastWestWallGeo, wallMaterial.clone());
      eastWall.position.set(halfW, halfWall, 0);
      scene.add(eastWall);

      const westWall = new THREE.Mesh(eastWestWallGeo, wallMaterial.clone());
      westWall.position.set(-halfW, halfWall, 0);
      scene.add(westWall);

      const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 });
      const mainFloor = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), floorMat);
      mainFloor.rotation.x = -Math.PI / 2;
      scene.add(mainFloor);

      const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(pitWidth, pitDepth), floorMat.clone());
      pitFloor.rotation.x = -Math.PI / 2;
      pitFloor.position.y = -pitDepthY;
      scene.add(pitFloor);

      const pitWallMat = wallMaterial.clone();
      const pitWallH = pitDepthY;
      const pitHalfW = pitWidth / 2;
      const pitHalfD = pitDepth / 2;
      const pitWallThickness = 0.3;
      const pitWalls = [
        { geo: new THREE.BoxGeometry(pitWidth, pitWallH, pitWallThickness), pos: [0, -pitDepthY / 2, -pitHalfD] as const },
        { geo: new THREE.BoxGeometry(pitWidth, pitWallH, pitWallThickness), pos: [0, -pitDepthY / 2, pitHalfD] as const },
        { geo: new THREE.BoxGeometry(pitWallThickness, pitWallH, pitDepth), pos: [-pitHalfW, -pitDepthY / 2, 0] as const },
        { geo: new THREE.BoxGeometry(pitWallThickness, pitWallH, pitDepth), pos: [pitHalfW, -pitDepthY / 2, 0] as const },
      ];
      pitWalls.forEach(({ geo, pos }) => {
        const w = new THREE.Mesh(geo, pitWallMat);
        w.position.set(pos[0], pos[1], pos[2]);
        scene.add(w);
      });

      const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), rainbowMaterial);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = wallHeight;
      scene.add(ceiling);

      const logoTexture = textureLoader.load('/gallery/electroneum-logo-symbol.svg');
      logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const vinyl = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 6),
        new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      vinyl.rotation.x = -Math.PI / 2;
      vinyl.position.set(0, 0.01, 0);
      scene.add(vinyl);
    } else {
    const halfRoomSize = ROOM_SIZE / 2;
    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const halfWallHeight = WALL_HEIGHT / 2;
    ['north', 'south', 'east', 'west'].forEach((dir) => {
      const wall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, halfWallHeight, -halfRoomSize);
      if (dir === 'south') wall.position.set(0, halfWallHeight, halfRoomSize);
      if (dir === 'east') { wall.rotation.y = Math.PI / 2; wall.position.set(halfRoomSize, halfWallHeight, 0); }
      if (dir === 'west') { wall.rotation.y = Math.PI / 2; wall.position.set(-halfRoomSize, halfWallHeight, 0); }
      scene.add(wall);
    });

    const crossWallGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10];
    crossWallSegments.forEach((segmentCenter) => {
      const w1 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w1.position.set(segmentCenter, LOWER_WALL_HEIGHT / 2, -CROSS_WALL_BOUNDARY);
      scene.add(w1);
      const w2 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w2.position.set(segmentCenter, LOWER_WALL_HEIGHT / 2, CROSS_WALL_BOUNDARY);
      scene.add(w2);
      const w3 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w3.rotation.y = Math.PI / 2;
      w3.position.set(-CROSS_WALL_BOUNDARY, LOWER_WALL_HEIGHT / 2, segmentCenter);
      scene.add(w3);
      const w4 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w4.rotation.y = Math.PI / 2;
      w4.position.set(CROSS_WALL_BOUNDARY, LOWER_WALL_HEIGHT / 2, segmentCenter);
      scene.add(w4);
    });

    const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    
    const ceiling = new THREE.Mesh(floorGeo, rainbowMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    scene.add(ceiling);

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(30, WALL_THICKNESS, 30), wallMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0);
    scene.add(platform);

    const underPlatform = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), rainbowMaterial);
    underPlatform.rotation.x = -1.5707963267948966;
    underPlatform.position.y = LOWER_WALL_HEIGHT;
    scene.add(underPlatform);

    const logoTexture = textureLoader.load('/gallery/electroneum-logo-symbol.svg');
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const vinylGeo = new THREE.PlaneGeometry(10, 10);
    const vinylMat = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    
    const groundVinyl = new THREE.Mesh(vinylGeo, vinylMat);
    groundVinyl.rotation.x = -Math.PI / 2;
    groundVinyl.position.set(0, 0.01, 0);
    scene.add(groundVinyl);

    const gBtn = createDiamondTeleporter();
    gBtn.position.set(0, 2.0, 0);
    gBtn.userData.targetY = PLATFORM_Y + 1.6 + WALL_THICKNESS / 2;
    scene.add(gBtn);

    const uBtn = createDiamondTeleporter();
    uBtn.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 2.0, 0);
    uBtn.userData.targetY = 1.6;
    scene.add(uBtn);
    teleportButtonsRef.current = [gBtn, uBtn];
    }

    // Helper to load 3D decorative accessories on the upper level (main gallery only)
    const loadDecorativeItems = () => {
      if (!highQuality || isPersonal) return;
      const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
      // 1. Create tables and rugs (procedural/textures)
      const tablePositions = [{ x: 0, z: 9.8 }, { x: 0, z: -9.8 }, { x: 9.8, z: 0 }, { x: -9.8, z: 0 }];
      tablePositions.forEach(pos => {
        const table = createProceduralTable();
        table.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
        table.rotation.y = Math.atan2(-pos.x, -pos.z);
        table.translateX(0.9);
        scene.add(table);
      });

      const rugTexture = textureLoader.load('/gallery/textures/starry_night_sky_background_1409-2.jpg');
      const rugMat = new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 1, metalness: 0, transparent: true, opacity: 0.9 });
      const rugGeo = new THREE.PlaneGeometry(6, 8);
      [{ x: 0, z: 10.4, rot: 0 }, { x: 0, z: -10.4, rot: Math.PI }, { x: 10.4, z: 0, rot: -Math.PI / 2 }, { x: -10.4, z: 0, rot: Math.PI / 2 }].forEach(pos => {
        const rug = new THREE.Mesh(rugGeo, rugMat);
        rug.rotation.x = -Math.PI / 2; rug.rotation.z = pos.rot;
        rug.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2 + 0.005, pos.z);
        scene.add(rug);
      });

      // 2. Load GLTF assets
      gltfLoader.load('/gallery/models/sofa.glb', (gltf) => {
        if (stopLoad) return;
        let sofaMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && !sofaMesh) {
            const box = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3(); box.getSize(size);
            if (size.x < 15 && size.z < 15) sofaMesh = child;
          }
        });
        if (sofaMesh) {
          const mesh = sofaMesh as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!;
          const size = new THREE.Vector3(); box.getSize(size);
          const targetWidth = 4.5;
          const scale = targetWidth / size.x;
          const sofaGroup = new THREE.Group();
          sofaGroup.add(mesh);
          mesh.scale.set(scale, scale * 2, scale);
          mesh.position.set(- (box.min.x + size.x / 2) * scale, - box.min.y * (scale * 2), - (box.min.z + size.z / 2) * scale);
          const sofaPositions = [{ x: 0, z: 11 }, { x: 0, z: -11 }, { x: 11, z: 0 }, { x: -11, z: 0 }];
          sofaPositions.forEach(pos => {
            const instance = sofaGroup.clone();
            instance.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
            instance.rotation.y = Math.atan2(-pos.x, -pos.z);
            scene.add(instance);
          });
        }
      });

      gltfLoader.load('/gallery/models/plant.glb', (gltf) => {
        if (stopLoad) return;
        const plantModel = gltf.scene;
        const modelBox = new THREE.Box3().setFromObject(plantModel);
        const modelMinY = modelBox.min.y;
        const modelMaxY = modelBox.max.y;
        const modelHeight = modelMaxY - modelMinY;
        plantModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox!;
            const meshMinY = box.min.y;
            const meshMaxY = box.max.y;
            const meshHeight = meshMaxY - meshMinY;
            const nMinY = (meshMinY - modelMinY) / modelHeight;
            const nMaxY = (meshMaxY - modelMinY) / modelHeight;
            if (nMinY < 0.05 && meshHeight < 0.05) { mesh.visible = false; return; }
            if (nMinY < 0.1 && nMaxY < 0.4) mesh.material = new THREE.MeshStandardMaterial({ color: 0xe2725b, roughness: 0.9 });
            else if (nMinY > 0.1 && nMinY < 0.3 && meshHeight < 0.1) mesh.material = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1.0 });
            else {
              const meshSize = new THREE.Vector3(); box.getSize(meshSize);
              const aspect = meshSize.y / Math.max(meshSize.x, meshSize.z);
              mesh.material = new THREE.MeshStandardMaterial({ color: aspect > 2.0 ? 0x3d2b1f : 0x2e7d32, roughness: aspect > 2.0 ? 0.8 : 0.6 });
            }
          }
        });
        const size = new THREE.Vector3(); modelBox.getSize(size);
        const scale = 2.5 / size.y;
        plantModel.scale.set(scale, scale, scale);
        [{ x: 14.2, z: 14.2 }, { x: -14.2, z: 14.2 }, { x: 14.2, z: -14.2 }, { x: -14.2, z: -14.2 }].forEach(pos => {
          const plant = plantModel.clone();
          plant.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
          scene.add(plant);
        });
      });

      gltfLoader.load('/gallery/models/Cappuccino_Mug.glb', (gltf) => {
        if (stopLoad) return;
        const mugModel = gltf.scene;
        const porcelainMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.5 });
        mugModel.traverse(c => { if (c instanceof THREE.Mesh) c.material = porcelainMat; });
        const box = new THREE.Box3().setFromObject(mugModel);
        const size = new THREE.Vector3(); box.getSize(size);
        const scale = 0.28 / size.x;
        mugModel.scale.set(scale, scale, scale);
        const bY = box.min.y * scale;
        tablePositions.forEach((pos, idx) => {
          const mug = mugModel.clone();
          const tY = PLATFORM_Y + WALL_THICKNESS / 2 + 0.84;
          mug.position.set(pos.x, tY - bY, pos.z);
          mug.rotation.y = Math.atan2(-pos.x, -pos.z);
          mug.translateX(1.1); mug.translateZ(0.25 * (idx % 2 === 0 ? 1 : -1));
          scene.add(mug);
        });
      });
    };

    const loadPersonalDecor = () => {
      if (!highQuality || !isPersonal) return;
      const pitY = -PERSONAL_LAYOUT.pitDepthY;

      const table = createProceduralTable();
      table.position.set(0, pitY, 0);
      scene.add(table);

      const rugTexture = textureLoader.load('/gallery/textures/starry_night_sky_background_1409-2.jpg');
      const rugMat = new THREE.MeshStandardMaterial({
        map: rugTexture,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.9,
      });
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), rugMat);
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(0, pitY + 0.01, 1.2);
      scene.add(rug);

      gltfLoader.load('/gallery/models/sofa.glb', (gltf) => {
        if (stopLoad) return;
        let sofaMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && !sofaMesh) {
            const box = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3();
            box.getSize(size);
            if (size.x < 15 && size.z < 15) sofaMesh = child;
          }
        });
        if (!sofaMesh) return;

        const buildSofa = (targetWidth: number) => {
          const mesh = (sofaMesh as THREE.Mesh).clone();
          mesh.geometry = (sofaMesh as THREE.Mesh).geometry.clone();
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!;
          const size = new THREE.Vector3();
          box.getSize(size);
          const scale = targetWidth / size.x;
          const group = new THREE.Group();
          group.add(mesh);
          mesh.scale.set(scale, scale * 2, scale);
          mesh.position.set(
            -(box.min.x + size.x / 2) * scale,
            -box.min.y * (scale * 2),
            -(box.min.z + size.z / 2) * scale,
          );
          return group;
        };

        const couch = buildSofa(3.8);
        couch.position.set(0, pitY, 2.8);
        couch.rotation.y = Math.PI;
        scene.add(couch);

        const armchairL = buildSofa(2.4);
        armchairL.position.set(-2.2, pitY, 0);
        armchairL.rotation.y = Math.PI / 2;
        scene.add(armchairL);

        const armchairR = buildSofa(2.4);
        armchairR.position.set(2.2, pitY, 0);
        armchairR.rotation.y = -Math.PI / 2;
        scene.add(armchairR);
      });
    };

    let stopLoad = false;
    const createPanels = async () => {
      const pGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
      const aShape = new THREE.Shape();
      aShape.moveTo(0, 0.15); aShape.lineTo(0.3, 0); aShape.lineTo(0, -0.15);
      const aGeo = new THREE.ShapeGeometry(aShape);
      const dOff = 0.15 + WALL_THICKNESS / 2;
      const aOff = 3.2;

      let allPanels: Panel[] = [];

      if (isPersonal && roomId) {
        const panelY = PERSONAL_LAYOUT.panelY;
        const personalPanels: Panel[] = [];
        for (const placement of getPersonalPanelPlacements()) {
          const key = personalPanelKey(roomId, placement.slot);
          const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
          mesh.position.set(placement.x + placement.dx, panelY, placement.z + placement.dz);
          mesh.rotation.y = placement.rotationY;
          scene.add(mesh);

          const rV = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, placement.rotationY, 0));
          const pA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          pA.rotation.y = placement.rotationY + Math.PI;
          pA.position.copy(mesh.position).addScaledVector(rV, -aOff);
          scene.add(pA);

          const nA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          nA.rotation.y = placement.rotationY;
          nA.position.copy(mesh.position).addScaledVector(rV, aOff);
          scene.add(nA);

          personalPanels.push({
            mesh,
            wallName: key,
            metadataUrl: '',
            isVideo: false,
            isGif: false,
            prevArrow: pA,
            nextArrow: nA,
            videoElement: null,
            gifStopFunction: null,
          });
        }
        panelsRef.current = personalPanels;
        allPanels = personalPanels;
      } else {
      const groundPanels: Panel[] = [];
      const firstPanels: Panel[] = [];
      const innerPanels: Panel[] = [];
      const wNames = ['north-wall', 'south-wall', 'east-wall', 'west-wall'] as const;
      const halfRoomSize = ROOM_SIZE / 2;
      const crossWallSegments = [-10, 10];
      
      // 1. Create Ground & First Floor Outer Panels
      for (let i = 0; i <= 4; i++) {
        for (const wBase of wNames) {
          const sC = (i - 2) * 10;
          for (const tier of [{ y: LOWER_PANEL_Y, s: '-ground' }, { y: UPPER_PANEL_Y, s: '-first' }]) {
            const key = `${wBase}-${i}${tier.s}` as string;
            let x = 0, z = 0, rY = 0, dx = 0, dz = 0;
            if (wBase === 'north-wall') { x = sC; z = -halfRoomSize; rY = 0; dz = dOff; }
            if (wBase === 'south-wall') { x = sC; z = halfRoomSize; rY = Math.PI; dz = -dOff; }
            if (wBase === 'east-wall') { x = halfRoomSize; z = sC; rY = -Math.PI / 2; dx = -dOff; }
            if (wBase === 'west-wall') { x = -halfRoomSize; z = sC; rY = Math.PI / 2; dx = dOff; }
            
            const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
            mesh.position.set(x + dx, tier.y, z + dz);
            mesh.rotation.y = rY;
            scene.add(mesh);

            const rV = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, rY, 0));
            const pA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            pA.rotation.y = rY + Math.PI; pA.position.copy(mesh.position).addScaledVector(rV, -aOff);
            scene.add(pA);

            const nA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            nA.rotation.y = rY; nA.position.copy(mesh.position).addScaledVector(rV, aOff);
            scene.add(nA);

            const p: Panel = { mesh, wallName: String(key), metadataUrl: '', isVideo: false, isGif: false, prevArrow: pA, nextArrow: nA, videoElement: null, gifStopFunction: null };
            
            if (tier.s === '-ground') {
              groundPanels.push(p);
            } else {
              firstPanels.push(p);
            }
          }
        }
      }

      // 2. Create Inner Wall Panels
      crossWallSegments.forEach((sc, idx) => {
        const cfgs = [
          { k: `north-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -5 - dOff], rot: Math.PI },
          { k: `north-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -5 + dOff], rot: 0 },
          { k: `south-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, 5 + dOff], rot: 0 },
          { k: `south-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, 5 - dOff], rot: Math.PI },
          { k: `east-inner-wall-outer-${idx}`, pos: [5 + dOff, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
          { k: `east-inner-wall-inner-${idx}`, pos: [5 - dOff, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { k: `west-inner-wall-outer-${idx}`, pos: [-5 - dOff, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { k: `west-inner-wall-inner-${idx}`, pos: [-5 + dOff, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
        ];
        cfgs.forEach(cfg => {
          const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
          m.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]); m.rotation.y = cfg.rot;
          scene.add(m);
          
          const rV = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, cfg.rot, 0));
          const pA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          pA.rotation.y = cfg.rot + Math.PI; pA.position.copy(m.position).addScaledVector(rV, -aOff);
          scene.add(pA);

          const nA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          nA.rotation.y = cfg.rot; nA.position.copy(m.position).addScaledVector(rV, aOff);
          scene.add(nA);

          const p: Panel = { mesh: m, wallName: cfg.k as any, metadataUrl: '', isVideo: false, isGif: false, prevArrow: pA, nextArrow: nA, videoElement: null, gifStopFunction: null };
          innerPanels.push(p);
        });
      });

      // Populate reference panels array for interaction raycaster
      panelsRef.current = [...groundPanels, ...innerPanels, ...firstPanels];
      allPanels = [...groundPanels, ...innerPanels, ...firstPanels];
      }

      onLoadingProgressRef.current?.(30);
      onLoadingMessageRef.current?.('Resolving collections…');

      const maybeDismissSplash = () => {
        if (!loadingCompleteCalledRef.current) {
          loadingCompleteCalledRef.current = true;
          onLoadingCompleteRef.current?.();
        }
      };

      const reportFirstTexture = () => {
        if (!firstImageReportedRef.current) {
          firstImageReportedRef.current = true;
          onFirstImageLoadedRef.current?.();
          maybeDismissSplash();
        }
      };

      const splashFallbackTimer = window.setTimeout(maybeDismissSplash, SPLASH_FALLBACK_MS);

      const panelSourceKeys = new Map<Panel, string>();

      const refreshPanelIfSourceChanged = (panel: Panel) => {
        const source = getCurrentNftSource(panel.wallName);
        const nextKey = source ? `${source.contractAddress.toLowerCase()}:${source.tokenId}` : '';
        const prevKey = panelSourceKeys.get(panel) ?? '';
        if (nextKey !== prevKey) {
          panelSourceKeys.set(panel, nextKey);
          void updatePanelContent(panel, source);
        }
      };

      const unsubscribeConfig = onGalleryConfigReady(() => {
        for (const panel of panelsRef.current) {
          refreshPanelIfSourceChanged(panel);
        }
      });

      onLoadingProgressRef.current?.(40);
      onLoadingMessageRef.current?.('Loading artwork…');

      const indexedByPanel = await panelCachePromise;

      const sortByProximity = (list: Panel[]) =>
        [...list].sort((a, b) => {
          const da = a.mesh.position.distanceToSquared(camera.position);
          const db = b.mesh.position.distanceToSquared(camera.position);
          return da - db;
        });

      const allPanelsSorted = sortByProximity(allPanels);
      const totalPanels = allPanelsSorted.length;
      let loadedPanels = 0;

      const loadPanelFromIndex = async (panel: Panel) => {
        const panelKey = String(panel.wallName);
        const metadata = indexedByPanel.get(panelKey);
        if (!metadata || panel.metadataUrl) return;
        const hadTexture = !!panel.metadataUrl;
        await applyPanelFromMetadata(panel, metadata);
        if (!hadTexture && panel.metadataUrl) {
          reportFirstTexture();
        }
        loadedPanels += 1;
        onLoadingProgressRef.current?.(40 + Math.round((50 * loadedPanels) / Math.max(totalPanels, 1)));
      };

      const runConcurrent = async (items: Panel[], worker: (panel: Panel) => Promise<void>) => {
        let cursor = 0;
        const runners = Array.from({ length: Math.min(PANEL_LOAD_CONCURRENCY, items.length) }, async () => {
          while (cursor < items.length) {
            if (stopLoad) return;
            const panel = items[cursor++];
            await worker(panel);
          }
        });
        await Promise.all(runners);
      };

      const indexedPanels = allPanelsSorted.filter((panel) => indexedByPanel.has(String(panel.wallName)));
      void runConcurrent(sortByProximity(indexedPanels), loadPanelFromIndex);

      void (async () => {
        await configPromise;
        for (const panel of panelsRef.current) {
          refreshPanelIfSourceChanged(panel);
        }

        const tokenSources = getAllPanelTokenSources();
        const batchCache = await getCachedGalleryMetadataBatch(tokenSources);
        prewarmGalleryMetadataCache(batchCache);

        const loadPanelWithProgress = async (panel: Panel) => {
          if (panel.metadataUrl) {
            loadedPanels += 1;
            return;
          }
          const source = getCurrentNftSource(panel.wallName);
          const sourceKey = source ? `${source.contractAddress.toLowerCase()}:${source.tokenId}` : '';
          panelSourceKeys.set(panel, sourceKey);

          const hadTexture = !!panel.metadataUrl;
          await updatePanelContent(panel, source);

          if (!hadTexture && panel.metadataUrl) {
            reportFirstTexture();
          }

          loadedPanels += 1;
          onLoadingProgressRef.current?.(40 + Math.round((60 * loadedPanels) / Math.max(totalPanels, 1)));
        };

        const remainingPanels = allPanelsSorted.filter((panel) => !panel.metadataUrl);
        await runConcurrent(remainingPanels, loadPanelWithProgress);

        window.clearTimeout(splashFallbackTimer);
        maybeDismissSplash();
        unsubscribeConfig();

        if (!stopLoad) {
          const scheduleDecor = () => (isPersonal ? loadPersonalDecor() : loadDecorativeItems());
          if ('requestIdleCallback' in window) {
            requestIdleCallback(scheduleDecor);
          } else {
            scheduleDecor();
          }
        }
      })();
    };
    createPanels();

    const fMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, depthTest: false });
    fadeMaterialRef.current = fMat;
    const fS = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fMat);
    fS.renderOrder = 999; fadeScreenRef.current = fS; scene.add(fS);

    const handlePointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      
      isPointerDownRef.current = true;
      isDraggingRef.current = false;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingRef.current = true;
      
      rotationRef.current.yaw += dx * 0.005;
      rotationRef.current.pitch += dy * 0.005;
      rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (!isDraggingRef.current) {
        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const objs = (sceneRef.current?.children ?? []).filter(o => o !== fadeScreenRef.current);
        const hits = raycasterRef.current.intersectObjects(objs, true);
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          let pT: THREE.Group | null = null;
          if (hit.parent?.userData?.isTeleportButton) pT = hit.parent as THREE.Group;
          else if (hit.parent?.parent?.userData?.isTeleportButton) pT = hit.parent.parent as THREE.Group;
          
          if (pT) {
            performTeleport(pT.userData.targetY);
          } else {
            const p = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
            if (p) {
              if (hit === p.prevArrow || hit === p.nextArrow) {
                if (updatePanelIndex(p.wallName, hit === p.nextArrow ? 'next' : 'prev')) {
                  updatePanelContent(p, getCurrentNftSource(p.wallName));
                }
              } else if (p.metadataUrl) {
                const panelConfig = getGalleryPanelConfig();
                const cfg = panelConfig[p.wallName];
                if (!cfg) return;
                const tokenId = cfg.tokenIds[cfg.currentIndex];
                if (!isGalleryTokenMinted(cfg.mintedTokenIds, tokenId)) {
                  toast.message(`Token #${tokenId} has not been minted yet. Marketplace links open once it exists on-chain.`);
                  return;
                }
                setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId });
              }
            }
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code in keysPressed.current) {
        keysPressed.current[e.code as keyof typeof keysPressed.current] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code in keysPressed.current) {
        keysPressed.current[e.code as keyof typeof keysPressed.current] = false;
      }
    };

    const container = mountEl;
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    let animationId = 0;
    let isVisible = !document.hidden;

    const onVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastTime = performance.now();
        animationId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const animate = () => {
      if (!isVisible) return;
      const time = performance.now();
      const delta = (time - lastTime) * 0.001; 
      lastTime = time;

      rainbowMaterial.uniforms.time.value = time * 0.001;
      
      teleportButtonsRef.current.forEach(btn => {
        const { electron1, electron2, diamond } = btn.userData;
        if (diamond) { 
          diamond.rotation.y += delta * 0.5; 
          diamond.position.y = Math.sin(time * 0.002) * 0.1; 
        }
        if (electron1) electron1.rotation.y += delta * 2;
        if (electron2) electron2.rotation.y -= delta * 1.5;
      });

      if (camera) {
        camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);

        const speed = 6.0;
        const fVec = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); 
        fVec.y = 0; fVec.normalize();
        const rVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); 
        rVec.y = 0; rVec.normalize();

        let moveX = 0;
        let moveZ = 0;

        if (keysPressed.current.KeyW || keysPressed.current.ArrowUp || isWalkingRef.current) {
          moveX += fVec.x;
          moveZ += fVec.z;
        }
        if (keysPressed.current.KeyS || keysPressed.current.ArrowDown) {
          moveX -= fVec.x;
          moveZ -= fVec.z;
        }
        if (keysPressed.current.KeyA || keysPressed.current.ArrowLeft) {
          moveX -= rVec.x;
          moveZ -= rVec.z;
        }
        if (keysPressed.current.KeyD || keysPressed.current.ArrowRight) {
          moveX += rVec.x;
          moveZ += rVec.z;
        }

        if (moveX !== 0 || moveZ !== 0) {
          const move = new THREE.Vector3(moveX, 0, moveZ).normalize().multiplyScalar(speed * delta);
          const nextX = new THREE.Vector3(camera.position.x + move.x, camera.position.y, camera.position.z);
          if (!checkCollision(nextX)) camera.position.x = nextX.x;
          const nextZ = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + move.z);
          if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
        }

        if (fadeScreenRef.current) { 
          fadeScreenRef.current.position.copy(camera.position); 
          fadeScreenRef.current.quaternion.copy(camera.quaternion); 
        }
      }

      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const el = (time - fadeStartTimeRef.current) / 1000;
        if (el < FADE_DURATION) fadeMaterialRef.current.opacity = el / FADE_DURATION;
        else if (el < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (el - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    const onResize = () => {
      const { width, height } = getViewportSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mountEl);
    window.addEventListener('resize', onResize);

    return () => {
      stopLoad = true;
      cancelAnimationFrame(animationId);
      document.removeEventListener('visibilitychange', onVisibility);
      panelsRef.current.forEach((panel) => {
        disposeTextureSafely(panel.mesh);
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.src = '';
        }
        if (panel.gifStopFunction) panel.gifStopFunction();
      });
      renderer.dispose();
      const gl = renderer.getContext();
      const loseContext = gl?.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();
      if (mountEl.contains(canvas)) {
        mountEl.removeChild(canvas);
      }
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [updatePanelContent, checkCollision, layout, roomId]);

  return (
    <div className="absolute inset-0 bg-black touch-none">
      {webglError ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">3D gallery unavailable</h2>
          <p className="max-w-md text-sm text-slate-400">
            {webglError} Close other tabs using 3D graphics, then refresh this page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-cyan-500 px-6 py-2 font-semibold text-black"
          >
            Refresh page
          </button>
        </div>
      ) : (
        <div ref={mountRef} className="absolute inset-0 touch-none [&_canvas]:!max-w-none [&_canvas]:!h-full [&_canvas]:!w-full" />
      )}
      {marketBrowserState.open && (
        <MarketBrowserRefined 
          collection={marketBrowserState.collection || ''} 
          tokenId={marketBrowserState.tokenId || ''} 
          open={marketBrowserState.open} 
          onClose={() => setMarketBrowserState({ open: false })} 
        />
      )}
    </div>
  );
};

export default NftGallery;