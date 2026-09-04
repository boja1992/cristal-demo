import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Texture } from 'three'

/**
 * Reads whatever texture <Environment> has actually assigned to scene.environment.
 * Needed instead of a second useEnvironment() call so Lightformers baked into the
 * portal scene are reflected in the texture MeshRefractionMaterial samples -
 * a separate hook call would load the raw preset only, without the lightformers.
 */
export function useSceneEnvironmentMap(): Texture | null {
  const { scene } = useThree()
  const [envMap, setEnvMap] = useState<Texture | null>(null)
  const current = useRef<Texture | null>(null)

  useFrame(() => {
    const next = scene.environment
    if (next !== current.current) {
      current.current = next
      setEnvMap(next)
    }
  })

  return envMap
}
