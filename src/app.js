import './scss/style.scss'
import * as THREE from 'three'
import * as dat from 'dat.gui'
import 'three/examples/js/shaders/CopyShader'
import 'three/examples/js/postprocessing/EffectComposer'
import 'three/examples/js/postprocessing/RenderPass'
import 'three/examples/js/postprocessing/ShaderPass'
import 'three/examples/js/shaders/HorizontalBlurShader'
import 'three/examples/js/shaders/VerticalBlurShader'
import 'three/examples/js/shaders/FilmShader'
import 'three/examples/js/shaders/LuminosityHighPassShader'
import './shaders/UnrealBloomPass'
import './shaders/badtv'
import './shaders/shaders'

const width = 1280;
const height = 720;
const lightColor = 0x0099ff;
const DEFAULT_LAYER = 0;
const OCCLUSION_LAYER = 1;
const renderScale = .25;
const gui = new dat.GUI();
const clock = new THREE.Clock();

let composer, 
    filmPass, 
    badTVPass, 
    bloomPass,
    occlusionComposer, 
    itemMesh, 
    occMesh, 
    occRenderTarget, 
    lightSource,
    vlShaderUniforms;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: true
});
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);

function setupScene() {
  lightSource = new THREE.Object3D();
  lightSource.position.x = 0;
  lightSource.position.y = -15;
  lightSource.position.z = -15;

  const itemGeo = new THREE.BoxGeometry(1, 1, 1);
  const itemMaterial = new THREE.MeshBasicMaterial({transparent: true, opacity: 0.2, color: 'blue'});
  itemMesh = new THREE.Mesh(itemGeo, itemMaterial);    
  scene.add(itemMesh);

  const occItemMaterial = new THREE.MeshBasicMaterial({transparent: true, opacity: 0.7, color: lightColor});
  occMesh = new THREE.Mesh(itemGeo, occItemMaterial);  
  occMesh.layers.set(OCCLUSION_LAYER);
  scene.add(occMesh);
  
  camera.position.z = 4.5;
}

function setupPostprocessing() {    
  occRenderTarget = new THREE.WebGLRenderTarget(width * renderScale, height * renderScale);

  // Blur passes
  const hBlur = new THREE.ShaderPass(THREE.HorizontalBlurShader);
  const vBlur = new THREE.ShaderPass(THREE.VerticalBlurShader);
  const bluriness = 7;
  hBlur.uniforms.h.value = bluriness / width;
  vBlur.uniforms.v.value = bluriness / height;

  // Bad TV Pass
  badTVPass = new THREE.ShaderPass(THREE.BadTVShader);
  badTVPass.uniforms.distortion.value = 1.9;
  badTVPass.uniforms.distortion2.value = 1.2;
  badTVPass.uniforms.speed.value = 0.1;
  badTVPass.uniforms.rollSpeed.value = 0;

  // Volumetric Light Pass
  const vlPass = new THREE.ShaderPass(THREE.VolumetericLightShader);
  vlShaderUniforms = vlPass.uniforms;
  vlPass.needsSwap = false;

  // Occlusion Composer
  occlusionComposer = new THREE.EffectComposer(renderer, occRenderTarget);
  occlusionComposer.addPass(new THREE.RenderPass(scene, camera));
  occlusionComposer.addPass(hBlur);
  occlusionComposer.addPass(vBlur);
  occlusionComposer.addPass(hBlur);
  occlusionComposer.addPass(vBlur);
  occlusionComposer.addPass(hBlur);
  occlusionComposer.addPass(badTVPass);
  occlusionComposer.addPass(vlPass);

  // Bloom pass
  bloomPass = new THREE.UnrealBloomPass(width / height, 0.5, .8, .3);

  // Film pass
  filmPass = new THREE.ShaderPass(THREE.FilmShader);
  filmPass.uniforms.sCount.value = 1200;
  filmPass.uniforms.grayscale.value = false;
  filmPass.uniforms.sIntensity.value = 1.5;
  filmPass.uniforms.nIntensity.value = 0.2;

  // Blend occRenderTarget into main render target 
  const blendPass = new THREE.ShaderPass(THREE.AdditiveBlendingShader);
  blendPass.uniforms.tAdd.value = occRenderTarget.texture;
  blendPass.renderToScreen = true;
  
  // Main Composer
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(bloomPass);
  //composer.addPass(badTVPass);
  composer.addPass(filmPass);
  composer.addPass(blendPass);
}

function onFrame() {
  requestAnimationFrame(onFrame);
  update();
  render();
}

function update() {
  const timeDelta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  filmPass.uniforms.time.value += timeDelta;
  badTVPass.uniforms.time.value += 0.01;

  if (itemMesh) {
    itemMesh.rotation.y += .01
    occMesh.rotation.copy(itemMesh.rotation);
  }
}

function render() {
  camera.layers.set(OCCLUSION_LAYER);
  occlusionComposer.render();

  camera.layers.set(DEFAULT_LAYER);
  composer.render();
}

function setupGUI() {
  let folder,
      min,
      max,
      step,
      updateShaderLight = function() {
        const p = lightSource.position.clone(),
            vector = p.project(camera),
            x = (vector.x + 1) / 2,
            y = (vector.y + 1) / 2;
        vlShaderUniforms.lightPosition.value.set(x, y);
      };

  updateShaderLight();

  // Bloom Controls
  folder = gui.addFolder('Bloom');
  folder.add(bloomPass, 'radius')
    .min(0)
    .max(10)
    .name('Radius');
  folder.add(bloomPass, 'threshold')
    .min(0)
    .max(1)
    .name('Threshold');
  folder.add(bloomPass, 'strength')
    .min(0)
    .max(10)
    .name('Strength');
  folder.open();

   // Bad TV Controls
  folder = gui.addFolder('TV');
  folder.add(badTVPass.uniforms.distortion, 'value')
    .min(0)
    .max(10)
    .name('Distortion 1');
  folder.add(badTVPass.uniforms.distortion2, 'value')
    .min(0)
    .max(10)
    .name('Distortion 2');
  folder.add(badTVPass.uniforms.speed, 'value')
    .min(0)
    .max(1)
    .name('Speed');
  folder.add(badTVPass.uniforms.rollSpeed, 'value')
    .min(0)
    .max(10)
    .name('Roll Speed');
  folder.open();

  // Light Controls
  folder = gui.addFolder('Light Position');
  folder.add(lightSource.position, 'x')
    .min(-50)
    .max(50)
    .onChange(updateShaderLight);
  folder.add(lightSource.position, 'y')
    .min(-50)
    .max(50)
    .onChange(updateShaderLight);
  folder.add(lightSource.position, 'z')
    .min(-50)
    .max(50)
    .onChange(updateShaderLight);
  folder.open();

  // Volumetric Light Controls
  folder = gui.addFolder('Volumeteric Light Shader');
  folder.add(vlShaderUniforms.exposure, 'value')
    .min(0)
    .max(1)
    .name('Exposure');
  folder.add(vlShaderUniforms.decay, 'value')
    .min(0)
    .max(1)
    .name('Decay');
  folder.add(vlShaderUniforms.density, 'value')
    .min(0)
    .max(10)
    .name('Density');
  folder.add(vlShaderUniforms.weight, 'value')
    .min(0)
    .max(1)
    .name('Weight');
  folder.add(vlShaderUniforms.samples, 'value')
    .min(1)
    .max(100)
    .name('Samples');

  folder.open();
}

function addRenderTargetImage() {           
  const material = new THREE.ShaderMaterial(THREE.PassThroughShader);
  material.uniforms.tDiffuse.value = occRenderTarget.texture;

  const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), material);
  composer.passes[1].scene.add(mesh);
  mesh.visible = false;

  const folder = gui.addFolder('Light Pass Render Image');
  folder.add(mesh, 'visible');
  folder.open();
}

setupScene();
setupPostprocessing();
onFrame();
setupGUI();
addRenderTargetImage();