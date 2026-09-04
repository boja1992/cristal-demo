import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, MeshRefractionMaterial, Center } from '@react-three/drei'
import { useControls } from 'leva'
import type { Texture } from 'three'

interface Props {
  url: string
  envMap: Texture
  intensity: number
}

interface MeshEntry {
  geometry: THREE.BufferGeometry
  matrixWorld: THREE.Matrix4
  material: THREE.Material
}

// The glTF's "diamond" material (KHR_materials_transmission, roughness 0) marks the
// gem meshes - those get the refraction shader. Everything else (the "silver" band)
// gets a normal PBR metal material so it reflects the env and responds to real lights.
const GEM_MATERIAL_NAME = 'diamond'

export default function RefractionBracelet({ url, envMap, intensity }: Props) {
  const { scene } = useGLTF(url)

  const { gemMeshes, metalMeshes, fitScale, layRotation, box } = useMemo(() => {
    const gems: MeshEntry[] = []
    const metal: MeshEntry[] = []
    const box = new THREE.Box3()
    scene.updateWorldMatrix(true, true)
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.geometry) {
        const material = mesh.material as THREE.Material
        const entry: MeshEntry = { geometry: mesh.geometry, matrixWorld: mesh.matrixWorld.clone(), material }
        if (material?.name === GEM_MATERIAL_NAME) {
          gems.push(entry)
        } else {
          metal.push(entry)
        }
        mesh.geometry.computeBoundingBox()
        const meshBox = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
        box.union(meshBox)
      }
    })
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const TARGET_SIZE = 2.4

    // Lay the model's longest axis flat along X, regardless of how it was exported.
    let rotation: [number, number, number] = [0, 0, 0]
    if (size.y >= size.x && size.y >= size.z) {
      rotation = [0, 0, Math.PI / 2]
    } else if (size.z >= size.x && size.z >= size.y) {
      rotation = [0, Math.PI / 2, 0]
    }

    return { gemMeshes: gems, metalMeshes: metal, fitScale: TARGET_SIZE / maxDim, layRotation: rotation, box }
  }, [scene])

  const { showOriginalMaterials } = useControls('Materials', {
    showOriginalMaterials: { value: false, label: 'show original (raw import)' },
  })

  const { useRefraction, bounces, aberrationStrength, ior, fresnel, color } = useControls('Refraction', {
    useRefraction: { value: true, label: 'enabled' },
    bounces: { value: 6, min: 0, max: 8, step: 1 },
    aberrationStrength: { value: 0.003, min: 0, max: 0.1, step: 0.001 },
    ior: { value: 2.4, min: 1, max: 3.5, step: 0.01 },
    fresnel: { value: 1, min: 0, max: 1, step: 0.01 },
    color: '#ffffff',
  })

  const { metalColor, metalness, roughness, envMapIntensity } = useControls('Metal', {
    metalColor: '#b0b0b0',
    metalness: { value: 1, min: 0, max: 1, step: 0.01 },
    roughness: { value: 0.14, min: 0, max: 1, step: 0.01 },
    envMapIntensity: { value: 1.2, min: 0, max: 3, step: 0.05 },
  })

  // The refraction shader has no dedicated intensity uniform - it multiplies the sampled
  // envMap color by `color`, so scaling that tint is how brightness is controlled.
  const tint = useMemo(() => new THREE.Color(color).multiplyScalar(intensity), [color, intensity])

  const { showBoundingBox } = useControls('Debug', {
    showBoundingBox: { value: true, label: 'bounding box' },
  })

  const { rotateX } = useControls('Model Rotation', {
    rotateX: { value: 0, min: 0, max: 360, step: 1 },
  })

  return (
    <group rotation={[THREE.MathUtils.degToRad(rotateX), 0, 0]}>
      <Center>
        <group rotation={layRotation}>
          <group scale={fitScale}>
            {showBoundingBox && <box3Helper args={[box, new THREE.Color('red')]} />}
            {gemMeshes.map((m, i) => {
              const useRefractionForThis = useRefraction && !showOriginalMaterials
              return (
                <mesh
                  key={`gem-${i}`}
                  geometry={m.geometry}
                  matrix={m.matrixWorld}
                  matrixAutoUpdate={false}
                  castShadow
                  receiveShadow
                  material={useRefractionForThis ? undefined : m.material}
                >
                  {useRefractionForThis && (
                    <MeshRefractionMaterial
                      envMap={envMap}
                      bounces={bounces}
                      aberrationStrength={aberrationStrength}
                      ior={ior}
                      fresnel={fresnel}
                      color={tint}
                      toneMapped={false}
                    />
                  )}
                </mesh>
              )
            })}
            {metalMeshes.map((m, i) => (
              <mesh
                key={`metal-${i}`}
                geometry={m.geometry}
                matrix={m.matrixWorld}
                matrixAutoUpdate={false}
                castShadow
                receiveShadow
                material={showOriginalMaterials ? m.material : undefined}
              >
                {!showOriginalMaterials && (
                  <meshStandardMaterial color={metalColor} metalness={metalness} roughness={roughness} envMapIntensity={envMapIntensity} />
                )}
              </mesh>
            ))}
          </group>
        </group>
      </Center>
    </group>
  )
}
