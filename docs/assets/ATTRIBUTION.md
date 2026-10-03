# Anatomical heart asset

`heart.glb` is **Realistic Human Heart** by **neshallads**.

- Original work: https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089
- Author: https://sketchfab.com/neshallads
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License text: https://creativecommons.org/licenses/by/4.0/
- Download mirror: https://github.com/Naveen2464/MediXR_Immersive_3D_Human_Heart_Anatomy_Visualizer/blob/main/assets/models/realistic_human_heart.glb

The GLB's embedded `asset.extras` retains the original title, author, license, and source URL. The source file is unmodified. ECG Studio centers and scales its geometry at runtime, adjusts lighting and material response, and adds illustrative cardiac motion and territory highlighting. These visual effects are not patient-specific simulations or validated anatomical segmentations. Attribution remains visible in the viewer.

Three.js and its GLTFLoader are MIT licensed; see `lib/THREE-LICENSE.txt`.

# Anatomical torso asset

`torso.glb` is a cropped derivative of **Visible Human Male Skin**, from the **HuBMAP / Human Reference Atlas 3D Reference Object Library**, release v1.2. It is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- Library and credits: https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html
- Library citation: Browne, K.; Schlehlein, H.; Herr II, B. W.; Quardokus, E.; Bueckle, A.; Börner, K. (2022), *HuBMAP CCF 3D Reference Object Library*.
- Original skin mesh: https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Skin.glb
- Original skin SHA-256: `8cab299d04323e6364938a271647df5671138a2177f412e741a0d6bd4536ee1c`
- Reference heart used for scale: https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Heart.glb
- Reference heart SHA-256: `b1237e7e765178e9357fd2ea7ccf19d55d0bf9ca55e187886635febe28244c70`

The source derives from the National Library of Medicine Visible Human dataset. ECG Studio clips the skin mesh at the neck, upper pelvis, and upper arms, retaining the original surface and interpolating normals along clipped edges. Runtime rendering adds a translucent material, a chest viewing window, and fading at crop boundaries. The derived GLB retains attribution in its metadata, and the viewer displays a linked credit.

To reproduce the derivative, download the original skin GLB and run `node scripts/prepare-torso.cjs /path/to/VH_M_Skin.glb`. Source coordinates are in meters; the output transform is `x = 4*x_source`, `y = 4*(y_source - 0.44)`, `z = 4*z_source`. Crop planes are recorded in the script.

In the body view, the displayed heart's width matches the approximately 0.124 m width of the HRA reference heart. Placement is adjusted to accommodate the displayed sculpt's longer great vessels. The heart and torso originate from different models: this is an illustrative alignment, not a registered same-subject reconstruction. Standalone heart inspection retains its larger display scale. Electrodes attach to the skin surface; landmarks and torso-projected limb electrodes remain diagrammatic.
