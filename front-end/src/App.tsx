import { useState } from 'react'

import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1 className='text-3xl font-bold'>Hello world</h1>
    </main>
  )
}

export default App
