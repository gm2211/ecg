# Anatomical heart and cardiac vessels

`heart.glb` is a derivative of **Visible Human Male Heart** and **Visible Human Male Blood Vasculature**, from the **HuBMAP / Human Reference Atlas 3D Reference Object Library**, release v1.2. The reference library describes its organs as developed by medical illustrators and approved by organ experts. Both source models are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- Library and credits: https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html
- Library citation: Browne, K.; Schlehlein, H.; Herr II, B. W.; Quardokus, E.; Bueckle, A.; Börner, K. (2022), *HuBMAP CCF 3D Reference Object Library*.
- Heart: https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Heart.glb
- Heart SHA-256: `b1237e7e765178e9357fd2ea7ccf19d55d0bf9ca55e187886635febe28244c70`
- Vessels: https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Blood_Vasculature.glb
- Vessels SHA-256: `a31ebed6d527b1cff31942e3e50d7c074c30b574337f68c4b89e9c88e4309d0d`
- NIH 3D heart catalog entry: https://3d.nih.gov/entries/21000?version=1

ECG Studio retains all 14 named heart structures (four chambers, septum, four valves and five papillary muscles) and 33 cardiac vessel meshes. Heart geometry is unchanged. Cardiac vessels are cropped at source y=0.415 and 0.585 m to omit the abdomen and neck; brachiocephalic, splenic and hepatic veins are omitted. Cut vessel ends remain open; they are display boundaries. Source names, anatomical metadata and source hashes remain embedded in the GLB. Vertex colors are removed, and runtime materials distinguish myocardium, valves, oxygenated routes and deoxygenated routes. Red and blue are teaching colors, not literal tissue colors.

To reproduce: download both source GLBs, then run `node scripts/prepare-heart.cjs /path/to/VH_M_Heart.glb /path/to/VH_M_Blood_Vasculature.glb`. The script verifies source hashes before writing the derivative.

Heart, vessels and torso share the original Visible Human coordinate frame: +X is patient left, +Y superior, +Z anterior. The body view uses the same metric transform for every structure: `x=4*x_source`, `y=4*(y_source-0.44)`, `z=4*z_source`. Standalone viewers center and uniformly scale that assembly without changing its orientation or proportions. No independent heart offset or rotation is fitted by eye.

The simulator uses the atlas mesh names to identify atrial, ventricular and septal tissue. Valves and vessels do not receive myocardial activation colors. Timing within a chamber is still an illustrative interpolation from the shared electrical model, not measured activation data or a cellular solver. Lead-explorer infarct highlights are representative regions within named tissue, not a coronary perfusion segmentation; the septal region is internal. Beat deformation is illustrative and the original geometry is preserved at rest.

The translucent conduction overlay is separately constructed teaching geometry. Its SA/AV nodes, His bundle, bundle branches and Purkinje fans are not segmented fibers from the Visible Human specimen. Their positions are fitted to the atlas anatomy; their clocks come from the same reduced electrical model as the tissue colors and ECG. The anatomical mesh itself remains unchanged.

## Anatomy comparison references

- OpenStax, *Anatomy and Physiology 2e*, §19.1, figures 19.2 and 19.6: position in the thorax, anterior/posterior surfaces, chambers and great vessels. https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy
- West Coast University, *Anatomy Series – Anatomy of the Heart – External/Superficial*: anterior/posterior surfaces, atrial appendages and coronary circulation. https://www.youtube.com/watch?v=RNjJlewslbI
- University of Minnesota Visible Heart Laboratory, *Atlas of Human Cardiac Anatomy*: additional human-heart anatomical context. https://www.vhlab.umn.edu/atlas/
- University of Minnesota, *Conduction System Tutorial*: nodal locations, bundle descent and subendocardial Purkinje branching. https://www.vhlab.umn.edu/atlas/conduction-system-tutorial/overview-of-cardiac-conduction.shtml

Textbook figures and video frames were used for comparison, not redistributed. Checks include the anterior right ventricle, posterior left atrium, left ventricular apex, pulmonary trunk anterior to the aortic root, pulmonary venous return to the posterior left atrium, and the shared heart/torso frame. These checks do not constitute clinical validation of this application or cover all anatomical variation.

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

Heart and torso now originate from the same registered reference. Electrodes attach to the skin surface, but their landmark placement and torso-projected limb locations remain diagrammatic; the torso contains no ribs or palpable-landmark model.
