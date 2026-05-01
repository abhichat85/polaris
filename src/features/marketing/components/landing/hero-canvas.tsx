"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function HeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.z = 5

    const setSize = () => {
      const { offsetWidth, offsetHeight } = container
      renderer.setSize(offsetWidth, offsetHeight)
      camera.aspect = offsetWidth / offsetHeight
      camera.updateProjectionMatrix()
    }

    setSize()
    container.appendChild(renderer.domElement)

    const PARTICLE_COUNT = 800
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    )
    const particleMat = new THREE.PointsMaterial({
      color: 0x4d5fff,
      size: 0.025,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    })
    const points = new THREE.Points(particleGeo, particleMat)
    scene.add(points)

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4d5fff,
      transparent: true,
      opacity: 0.04,
    })
    const lines: THREE.Line[] = []
    for (let i = 0; i < 30; i++) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 4,
        ),
        new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 4,
        ),
      ])
      const line = new THREE.Line(lineGeo, lineMat)
      lines.push(line)
      scene.add(line)
    }

    let frameId = 0
    let t = 0
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      t += 0.0004
      points.rotation.y = t * 0.3
      points.rotation.x = Math.sin(t * 0.5) * 0.05
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => setSize()
    window.addEventListener("resize", handleResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener("resize", handleResize)
      renderer.dispose()
      particleGeo.dispose()
      particleMat.dispose()
      lines.forEach((line) => {
        line.geometry.dispose()
      })
      lineMat.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden md:block"
    />
  )
}
