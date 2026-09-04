import { Loader } from '@react-three/drei'
import Scene from './components/Scene'

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Scene />
      <Loader />
    </div>
  )
}
