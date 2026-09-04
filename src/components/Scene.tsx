import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, OrbitControls, Lightformer, MeshReflectorMaterial } from '@react-three/drei'
import { Leva, useControls, button } from 'leva'
import RefractionBracelet from './RefractionBracelet'
import { useQueryParam } from '../hooks/useQueryParam'
import { useSceneEnvironmentMap } from '../hooks/useSceneEnvironmentMap'

const DEFAULT_MODEL_URL = './models/Messika_01.glb'
const CUSTOM_HDR_URL = './hdr/studio_small_08_2k.hdr'

type PresetName = 'studio' | 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'sunset' | 'warehouse'

const HDR_SOURCES: Record<string, 'custom' | PresetName> = {
  'Studio (custom)': 'custom',
  Studio: 'studio',
  Apartment: 'apartment',
  City: 'city',
  Dawn: 'dawn',
  Forest: 'forest',
  Lobby: 'lobby',
  Night: 'night',
  Park: 'park',
  Sunset: 'sunset',
  Warehouse: 'warehouse',
}

const TONE_MAPPING_OPTIONS = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  Linear: THREE.LinearToneMapping,
  None: THREE.NoToneMapping,
}

function RendererSettings({ exposure, toneMapping }: { exposure: number; toneMapping: THREE.ToneMapping }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMapping = toneMapping
    gl.toneMappingExposure = exposure
  }, [gl, exposure, toneMapping])
  return null
}

// Dev-only: puts the live scene/camera/renderer on window so materials can be
// inspected and edited from the browser console. Stripped from production builds.
function ExposeToWindow() {
  const state = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.showroom = { scene: state.scene, camera: state.camera, gl: state.gl, THREE }
    console.log(
      '[dev] window.showroom = { scene, camera, gl, THREE }\n' +
        'Try: showroom.scene.traverse(o => o.isMesh && console.log(o.name, o.material.name, o.material))',
    )
  }, [state])
  return null
}

function GradientBackground({ top, bottom }: { top: string; bottom: string }) {
  const scene = useThree((s) => s.scene)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, top)
    gradient.addColorStop(1, bottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 16, 256)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [top, bottom])

  useEffect(() => {
    scene.background = texture
    return () => {
      texture.dispose()
    }
  }, [scene, texture])

  return null
}

// A radial alpha mask (opaque center, transparent edge) so the plane's own square
// boundary - corners included - fades out before the geometry actually ends, instead
// of cutting off as a visible hard edge. fadeRadius/fadeWidth are in world units, not
// a fraction of the plane - otherwise the fade zone scales with `size` and can end up
// entirely outside the visible camera frame on a large plane.
function useEdgeFadeTexture(planeSize: number, fadeRadius: number, fadeWidth: number) {
  return useMemo(() => {
    const texSize = 256
    const canvas = document.createElement('canvas')
    canvas.width = texSize
    canvas.height = texSize
    const ctx = canvas.getContext('2d')!
    const innerUv = Math.min(0.5, fadeRadius / planeSize)
    const outerUv = Math.min(0.5, (fadeRadius + fadeWidth) / planeSize)
    const gradient = ctx.createRadialGradient(texSize / 2, texSize / 2, innerUv * texSize, texSize / 2, texSize / 2, outerUv * texSize)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, texSize, texSize)
    return new THREE.CanvasTexture(canvas)
  }, [planeSize, fadeRadius, fadeWidth])
}

// A glossy reflective floor (catalog-photography style) rather than a plain shadow
// catcher - it reflects the bracelet the same way the studio-photo reference does,
// and still receives the directional light's cast shadow for contact grounding.
function ReflectiveFloor({
  opacity,
  roughness,
  floorColor,
  reflectivity,
  size,
  fadeRadius,
  fadeWidth,
}: {
  opacity: number
  roughness: number
  floorColor: string
  reflectivity: number
  size: number
  fadeRadius: number
  fadeWidth: number
}) {
  const fadeTexture = useEdgeFadeTexture(size, fadeRadius, fadeWidth)

  return (
    <>
      <directionalLight
        position={[3, 6, 2]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.1}
        shadow-camera-far={8}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[200, 80]}
          mixBlur={1}
          mixStrength={reflectivity * 100}
          roughness={roughness}
          depthScale={0}
          color={floorColor}
          metalness={0.4}
          mirror={0}
          transparent
          opacity={opacity}
          alphaMap={fadeTexture}
        />
      </mesh>
    </>
  )
}

function SceneContents({ modelUrl, transparent }: { modelUrl: string; transparent: boolean }) {
  // World-space axes at the origin (red=X, green=Y, blue=Z) - independent of the
  // model's own local rotation, so it's a fixed reference for checking orientation.
  const { showAxes, axesSize } = useControls('Debug', {
    showAxes: { value: true, label: 'world axes' },
    axesSize: { value: 3, min: 0.5, max: 10, step: 0.5 },
  })

  const { autoRotate, autoRotateSpeed } = useControls('Rotation', {
    autoRotate: false,
    autoRotateSpeed: { value: 1.2, min: -10, max: 10, step: 0.1 },
  })

  const { floorOpacity, floorRoughness, floorReflectivity, floorSize, floorFadeRadius, floorFadeWidth, fogNear, fogFar } = useControls(
    'Floor',
    {
      floorOpacity: { value: 0.13, min: 0, max: 1, step: 0.01 },
      floorRoughness: { value: 0.12, min: 0, max: 1, step: 0.01 },
      floorReflectivity: { value: 0.3, min: 0, max: 1, step: 0.01 },
      floorSize: { value:100, min: 1.5, max: 100, step: 0.5 },
      floorFadeRadius: { value: 7.9, min: 0, max: 10, step: 0.1 },
      floorFadeWidth: { value: 7.0, min: 0.2, max: 10, step: 0.1 },
      fogNear: { value: 21.9, min: 0.5, max: 30, step: 0.1 },
      fogFar: { value: 33.1, min: 1, max: 40, step: 0.1 },
    },
  )

  const { backgroundTop, backgroundBottom } = useControls('Background', {
    backgroundTop: '#ffffff',
    backgroundBottom: '#0c0b09',
  })

  // The floor sits low in frame, where the background gradient reads closest to
  // backgroundBottom - tying its color to that (instead of a separate swatch) keeps
  // it blending into the backdrop by construction rather than needing manual matching.
  const floorColor = backgroundBottom

  // Base case: HDR alone is the light source (env for the diamonds' refraction, IBL
  // reflections for the metal). Everything below this is opt-in on top of that.
  const [{ source, showBackdrop, blur, exposure, intensity, toneMapping }, setHdr] = useControls('HDR', () => ({
    source: { value: 'custom', options: HDR_SOURCES },
    showBackdrop: { value: false, label: 'showBackdrop' },
    blur: { value: 0.4, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.2, max: 3, step: 0.05 },
    intensity: { value: 1, min: 0.1, max: 3, step: 0.05 },
    toneMapping: { value: 'ACESFilmic', options: Object.keys(TONE_MAPPING_OPTIONS) },
  }))

  // Real lights - these only reach the metal (plain meshStandardMaterial) and the
  // floor. The diamond shader ignores THREE lights entirely; it only ever samples
  // the env map, so these will not visibly change the gems no matter how high they go.
  const [{ ambientOn, ambientIntensity }, setAmbient] = useControls('Ambient Light', () => ({
    ambientOn: { value: false, label: 'enabled' },
    ambientIntensity: { value: 0.4, min: 0, max: 2, step: 0.05 },
  }))

  const [{ dirOn, dirCount, dirIntensity, dirColor }, setDir] = useControls('Directional Lights', () => ({
    dirOn: { value: false, label: 'enabled' },
    dirCount: { value: 4, options: { '2 (sides)': 2, '4 (sides)': 4 } },
    dirIntensity: { value: 0.6, min: 0, max: 2, step: 0.05 },
    dirColor: '#ffffff',
  }))

  const directionalPositions = useMemo((): [number, number, number][] => {
    return dirCount === 2
      ? [
          [4, 2, 0],
          [-4, 2, 0],
        ]
      : [
          [4, 2, 0],
          [-4, 2, 0],
          [0, 2, 4],
          [0, 2, -4],
        ]
  }, [dirCount])

  // The classic jewelry-photography rig: a few large, sharp-edged softbox panels
  // around the piece. This is what gives metal its crisp reflected light *bands*
  // (a diffuse HDR alone only gives a soft, patchy gradient) and gives the diamonds
  // a strong overhead key for per-facet light/dark contrast ("depth"). Always baked
  // into the env map, so it feeds both the metal's IBL reflections and the gem shader.
  const [{ studioOn, overheadIntensity, sideIntensity, fillIntensity, softboxSharpness }, setStudio] = useControls('Studio Softbox', () => ({
    studioOn: { value: true, label: 'enabled' },
    overheadIntensity: { value: 3, min: 0, max: 10, step: 0.1 },
    sideIntensity: { value: 2, min: 0, max: 10, step: 0.1 },
    fillIntensity: { value: 2, min: 0, max: 8, step: 0.05 },
    softboxSharpness: { value: 0.35, min: 0, max: 1, step: 0.01 },
  }))

  // A near-mirror metal (low roughness) reflects a very narrow slice of the
  // environment at each point on its curved surface, so any gap in lighting
  // coverage shows as a dead-black arc. This bracelet stands as a vertical loop,
  // so the reflected directions sweep through elevation as much as azimuth - a
  // single horizontal ring of panels isn't enough, it needs several rings at
  // different heights, like a real light tent wrapping most of the way around.
  const softboxRing = useMemo(() => {
    const panels: { position: [number, number, number]; scale: [number, number, number] }[] = []
    const bands: { height: number; radius: number; count: number; scale: [number, number, number] }[] = [
      { height: 4, radius: 3.2, count: 6, scale: [2, 2, 1] },
      { height: 1.6, radius: 4, count: 8, scale: [2.2, 3, 1] },
      { height: -1.2, radius: 3.6, count: 6, scale: [2, 2.4, 1] },
    ]
    bands.forEach(({ height, radius, count, scale }, bandIndex) => {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + bandIndex * 0.4
        panels.push({
          position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
          scale,
        })
      }
    })
    return panels
  }, [])

  // Optional env-baked "extra sparkle" rig for the diamonds specifically (the only
  // way to add catch-lights to that shader - see note above). One combined knob
  // scales the whole rig rather than five separate 0-20 sliders.
  const [{ sparkleOn, sparkleAmount }, setSparkle] = useControls('Gem Sparkle (env-baked)', () => ({
    sparkleOn: { value: false, label: 'enabled' },
    sparkleAmount: { value: 0.4, min: 0, max: 1, step: 0.01 },
  }))

  const SPARKLE_RIG_SCALE = 12
  const rigMagnitude = sparkleOn ? sparkleAmount * SPARKLE_RIG_SCALE : 0

  // Blender's viewport lookdev for this asset is just the raw studio HDRI as both
  // background and lighting, at strength 1 - no extra rig, no exposure push. This
  // resets HDR/lights back to that baseline without touching Floor/Background/Refraction.
  useControls('Presets', {
    'Blender viewport look': button(() => {
      setHdr({ source: 'custom', showBackdrop: true, blur: 0, exposure: 1, intensity: 1 })
      setAmbient({ ambientOn: false })
      setDir({ dirOn: false })
      setStudio({ studioOn: false })
      setSparkle({ sparkleOn: false })
    }),
  })

  // Many small, distinct bright points (rather than a few soft area lights) is what
  // makes pave diamonds read as sparkly - each facet needs a crisp highlight to catch,
  // not a smooth gradient it can only reflect a dim average of.
  const sparklePositions = useMemo(() => {
    const points: [number, number, number][] = []
    const count = 12
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 4.5
      const height = 0.5 + Math.abs(Math.sin(i * 2.1)) * 3
      points.push([Math.cos(angle) * radius, height, Math.sin(angle) * radius])
    }
    return points
  }, [])

  const envMap = useSceneEnvironmentMap()
  const envSourceProps: { files: string; preset?: undefined } | { preset: PresetName; files?: undefined } =
    source === 'custom' ? { files: CUSTOM_HDR_URL } : { preset: source as PresetName }

  // Sharper softbox edges read as the crisp reflected "streaks" a real lightbox rig
  // gives you; a heavily blurred env instead melts everything into a soft gradient.
  const effectiveBlur = blur * (1 - softboxSharpness)

  return (
    <>
      <RendererSettings exposure={exposure} toneMapping={TONE_MAPPING_OPTIONS[toneMapping as keyof typeof TONE_MAPPING_OPTIONS]} />
      <ExposeToWindow />
      {showAxes && <axesHelper args={[axesSize]} />}

      {/* The floor's flat color can't exactly match the background gradient at every
          screen row, so its far reach (the perspective "horizon" of a large ground
          plane) shows as a hard line without this - fog fades it into backgroundBottom
          smoothly with distance instead, which is what actually removes the seam. */}
      {!transparent && <fog attach="fog" args={[backgroundBottom, fogNear, fogFar]} />}

      {/* HDR is always used to light/reflect the model; the photographed dome itself
          is only shown as a backdrop when showBackdrop is on - otherwise the flat
          canvas color behind keeps the scene seamless. */}
      <Environment resolution={1024} background={showBackdrop && !transparent} blur={effectiveBlur} {...envSourceProps}>
        {(studioOn || sparkleOn) && (
          <group>
            {studioOn && (
              <>
                {/* Low even floor so a near-mirror surface never shows dead-black gaps
                    between the brighter panels below. */}
                <Lightformer form="rect" intensity={fillIntensity} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={22} />
                {/* Overhead key - directly above, facing straight down. This is what gives
                    each facet/each point on the curved band a strong light-to-dark falloff
                    ("depth") instead of a flat, evenly-lit look. */}
                <Lightformer form="rect" intensity={overheadIntensity} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 4, 1]} />
                {/* A full ring of softboxes - these are what reflect as the crisp parallel
                    light bands running all the way around a curved polished metal surface. */}
                {softboxRing.map((panel, i) => (
                  <Lightformer key={i} form="rect" intensity={sideIntensity} position={panel.position} scale={panel.scale} target={[0, 0, 0]} />
                ))}
                {/* Many small, distinct catch-lights, not just the large panels above - a
                    diamond facet reflects a near-point sample of the environment, so a few
                    big soft panels alone make it read as a flat, evenly-lit white blob.
                    This is what actually gives individual stones their per-facet sparkle. */}
                {sparklePositions.map((pos, i) => (
                  <Lightformer key={`gem-catchlight-${i}`} form="circle" intensity={overheadIntensity * 0.6} position={pos} scale={0.5} target={[0, 0, 0]} />
                ))}
              </>
            )}
            {sparkleOn && (
              <>
                {/* A big soft rect behind everything, further away than the HDR "skybox" is
                    rendered, would occlude it entirely (Lightformers are opaque meshes) - so
                    this stays large-but-partial rather than fully enclosing, to lift the
                    ambient floor without hiding the chosen HDR image behind it. */}
                <Lightformer form="rect" intensity={rigMagnitude * 0.5} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={20} />
                <Lightformer form="rect" intensity={rigMagnitude * 0.65} position={[3, 4, 2]} scale={[3, 3, 1]} target={[0, 0, 0]} />
                <Lightformer form="rect" intensity={rigMagnitude * 0.35} position={[-4, 1, 3]} scale={[3, 4, 1]} target={[0, 0, 0]} />
                <Lightformer form="ring" intensity={rigMagnitude * 0.5} position={[0, 2, -5]} scale={4} target={[0, 0, 0]} />
                {sparklePositions.map((pos, i) => (
                  <Lightformer key={i} form="circle" intensity={rigMagnitude * 0.6} position={pos} scale={0.5} target={[0, 0, 0]} />
                ))}
              </>
            )}
          </group>
        )}
      </Environment>

      {ambientOn && <ambientLight intensity={ambientIntensity} />}
      {dirOn &&
        directionalPositions.map((pos, i) => <directionalLight key={i} position={pos} intensity={dirIntensity} color={dirColor} />)}

      {envMap && <RefractionBracelet url={modelUrl} envMap={envMap} intensity={intensity} />}

      {!transparent && !showBackdrop && <GradientBackground top={backgroundTop} bottom={backgroundBottom} />}
      <ReflectiveFloor
        opacity={floorOpacity}
        roughness={floorRoughness}
        floorColor={floorColor}
        reflectivity={floorReflectivity}
        size={floorSize}
        fadeRadius={floorFadeRadius}
        fadeWidth={floorFadeWidth}
      />
      <OrbitControls
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={autoRotateSpeed}
        minDistance={1.5}
        maxDistance={6}
      />
    </>
  )
}

export default function Scene() {
  const modelParam = useQueryParam('model')
  const uiHidden = useQueryParam('ui') === 'hidden'
  const transparent = useQueryParam('transparent') === 'true'

  const modelUrl = modelParam ?? DEFAULT_MODEL_URL

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <Leva hidden={uiHidden} collapsed={false} titleBar={{ title: 'Controls' }} />
      <Canvas
        shadows
        camera={{ position: [4.1, 1.9, 2.1], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: transparent }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <SceneContents modelUrl={modelUrl} transparent={transparent} />
        </Suspense>
      </Canvas>
    </div>
  )
}
