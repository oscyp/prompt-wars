import type { MoveType } from './battles';

type Methods = readonly [string, string, string];
type SceneMethods = Record<MoveType, readonly [Methods, Methods, Methods]>;

/** Version one extends frozen action/intent prose with independently readable
 * methods. Each action has three concrete execution choices, compatible with
 * each of its goals; the selected goal still determines the desired outcome.
 * Complete sentences preserve punctuation in the shipped intention catalogue. */
export const AUTHORED_APPROACHES: Readonly<Record<string, SceneMethods>> = {
  'frozen-1': {
    attack: [
      [
        'I keep the post close to my leading shoulder.',
        'I delay the turn until I have planted my rear foot.',
        'I show my hand on one side before rounding the other.',
      ],
      [
        'I keep my weight above the foot that stays planted.',
        'I shorten the slide before extending my arm.',
        'I slide diagonally rather than straight toward them.',
      ],
      [
        'I match my steps to the passing gust.',
        'I keep my striking hand below the drifting snow.',
        'I shift sideways within the gust before advancing.',
      ],
    ],
    defense: [
      [
        'I lower my shoulders beneath the top of the post.',
        'I circle the post without turning my back.',
        'I pause behind the stone before choosing my next step.',
      ],
      [
        'I spread my weight between both feet.',
        'I bend my knees while keeping my hands high.',
        'I pivot on the planted foot instead of taking a long step.',
      ],
      [
        'I turn the shoulder nearest the gust away from the wind.',
        'I keep watching their outline from the edge of my guard.',
        'I move sideways with short steps as the snow passes.',
      ],
    ],
    finisher: [
      [
        'I show my shoulder around one side before reversing.',
        'I plant my rear foot before the change of direction.',
        'I make the first movement wide and the return tight.',
      ],
      [
        'I keep my supporting knee bent throughout the sweep.',
        'I trace a short arc close to the ice.',
        'I hold my free hand high while sweeping beneath it.',
      ],
      [
        'I stay low until the last veil of snow passes.',
        'I take one measured step before extending the strike.',
        'I push off diagonally from a planted rear foot.',
      ],
    ],
  },
  'frozen-2': {
    attack: [
      [
        'I keep one pillar beside my shoulder while advancing.',
        'I change lanes only after planting both feet.',
        'I show a high guard before taking the lower gap.',
      ],
      [
        'I place my lead foot beyond the ridge before extending.',
        'I keep my trailing knee bent over the raised ground.',
        'I angle the lunge across the ridge rather than along it.',
      ],
      [
        'I brush the powder with the outside of my foot.',
        'I keep my striking hand still until the powder rises.',
        'I send the powder sideways before stepping forward.',
      ],
    ],
    defense: [
      [
        'I keep the pillar within reach of my near hand.',
        'I take two small steps around the base.',
        'I wait beside the ice until I can see the next lane.',
      ],
      [
        'I bend the rear knee rather than locking it.',
        'I keep my forward foot light enough to pivot.',
        'I turn my hips while keeping the rear heel braced.',
      ],
      [
        'I watch the powder nearest the ground.',
        'I compare the drifting powder with fresh disturbances.',
        'I keep my head still while scanning both sides.',
      ],
    ],
    finisher: [
      [
        'I keep my turn tight to the pillar.',
        'I shorten the last circling step before cutting inward.',
        'I let my shoulder lead while my guard stays close.',
      ],
      [
        'I show the upper feint before crossing the ridge.',
        'I land my front foot before driving my hand forward.',
        'I cross diagonally with my weight kept low.',
      ],
      [
        'I let the low hand lead the first movement.',
        'I plant my feet before changing the height of the strike.',
        'I angle my final step away from the rising powder.',
      ],
    ],
  },
  'frozen-3': {
    attack: [
      [
        'I scrape with the outside edge of my boot.',
        'I keep most of my weight on my rear foot.',
        'I follow the arc with a small shoulder feint.',
      ],
      [
        'I keep my striking hand on the darker side.',
        'I cross the boundary with short diagonal steps.',
        'I pause at the shadow edge before closing distance.',
      ],
      [
        'I keep my near shoulder parallel to the wall.',
        'I take a small outer step before angling inward.',
        'I keep my feet beneath me throughout the advance.',
      ],
    ],
    defense: [
      [
        'I place each foot before shifting my weight.',
        'I keep my knees bent and my steps narrow.',
        'I turn through several small steps rather than one pivot.',
      ],
      [
        'I move sideways while keeping my face toward them.',
        'I stop short of the deepest shadow to retain my view.',
        'I keep my hands close to my outline as I withdraw.',
      ],
      [
        'I keep my supporting elbow slightly bent.',
        'I slide my hand along the wall as I step.',
        'I use brief contact with the wall rather than leaning fully.',
      ],
    ],
    finisher: [
      [
        'I raise my hand without raising my centre of balance.',
        'I shorten the sweep to the ground directly ahead.',
        'I shift my weight to the rear foot before sweeping.',
      ],
      [
        'I keep the thrust close to my body until leaving shadow.',
        'I plant my front foot at the boundary before extending.',
        'I step diagonally into the light instead of straight ahead.',
      ],
      [
        'I advance in short steps without crowding the wall.',
        'I keep my lead shoulder turned toward the open side.',
        'I pause between steps to keep my guard aligned.',
      ],
    ],
  },
  'ember-1': {
    attack: [
      [
        'I choose one clear lane before leaving cover.',
        'I keep my shoulders narrow between the pillars.',
        'I change pace after passing the nearest pillar.',
      ],
      [
        'I keep the strike close to the rim without hitting it.',
        'I shift my lead foot beyond the near corner.',
        'I show my hand above the trough before attacking beside it.',
      ],
      [
        'I brush with my toe while keeping my heel near the floor.',
        'I keep the ash movement smaller than my following step.',
        'I move my shoulder only after the ash begins to spread.',
      ],
    ],
    defense: [
      [
        'I circle in small steps with the pillar near my shoulder.',
        'I stop beside the pillar before changing direction.',
        'I keep sight of both edges while moving behind it.',
      ],
      [
        'I keep my hips parallel to the trough.',
        'I lead with the foot nearest the clear floor.',
        'I keep one hand high while taking a short side step.',
      ],
      [
        'I look for ash pushed against the direction of the drift.',
        'I watch both feet rather than following their hands.',
        'I keep still long enough to separate old marks from new.',
      ],
    ],
    finisher: [
      [
        'I expose one shoulder before driving around the other side.',
        'I plant my rear foot behind the pillar before pushing off.',
        'I make the outward step shorter than the initial feint.',
      ],
      [
        'I keep my shoulder just outside the trough edge.',
        'I plant my leading foot beyond the end before striking.',
        'I slow beside the rim and accelerate past its end.',
      ],
      [
        'I keep the low sweep small and close to my feet.',
        'I plant my supporting foot before lifting the strike.',
        'I leave a brief pause between the low and high movements.',
      ],
    ],
  },
  'ember-2': {
    attack: [
      [
        'I keep the workbench corner beside my forward shoulder.',
        'I take an outer step before extending around the corner.',
        'I show the lunge high before bringing my hand around the side.',
      ],
      [
        'I grip the chain near waist height and pull sideways.',
        'I keep the chain beyond my own leading foot.',
        'I begin with a short pull before stepping behind its swing.',
      ],
      [
        'I move my hand as the shadow reaches my shoulder.',
        'I keep my feet still during the first feint.',
        'I change the feint height between two passes of shadow.',
      ],
    ],
    defense: [
      [
        'I keep the bench near my shoulder without leaning on it.',
        'I take short backward steps while facing the open side.',
        'I pause before the corner to choose a clear next step.',
      ],
      [
        'I pass behind the chain farthest from my shoulder.',
        'I keep my hands close while moving between the links.',
        'I wait for a chain to swing away before sidestepping.',
      ],
      [
        'I focus on the line between their shoulders.',
        'I compare their hips with the placement of their feet.',
        'I hold my head still as the shadows move around us.',
      ],
    ],
    finisher: [
      [
        'I shorten my steps before turning around the bench.',
        'I show my shoulder at the near end before reversing.',
        'I keep my guard close while crossing behind the bench.',
      ],
      [
        'I guide the chain outward with a short sideways pull.',
        'I keep my strike behind the space cleared by the chain.',
        'I plant my feet before releasing the chain to swing aside.',
      ],
      [
        'I settle my weight on the rear foot during the pause.',
        'I keep my hand close until beginning the thrust.',
        'I make the first advancing step diagonal rather than straight.',
      ],
    ],
  },
  'ember-3': {
    attack: [
      [
        'I clear the channel with my leading foot before extending.',
        'I keep my knees soft while crossing the groove.',
        'I angle my shoulders separately from the direction of my step.',
      ],
      [
        'I leave room between my feet and the ledge.',
        'I keep my leading shoulder turned toward the open floor.',
        'I use small changes of pace along the straight edge.',
      ],
      [
        'I stamp lightly while keeping my weight on the other foot.',
        'I turn my shoulder with the false step before reversing.',
        'I keep my hand still until the soot begins to settle.',
      ],
    ],
    defense: [
      [
        'I stop with both feet clear of the channel.',
        'I keep my lead hand above the gap between us.',
        'I move sideways along the channel instead of retreating across it.',
      ],
      [
        'I bend both knees before meeting the pressure.',
        'I keep my rear heel close to the ledge without crossing it.',
        'I turn through my hips while keeping my feet planted.',
      ],
      [
        'I compare fresh edges with the older disturbed soot.',
        'I scan the nearest marks before looking farther ahead.',
        'I keep my stance still while following the line of prints.',
      ],
    ],
    finisher: [
      [
        'I show my leading foot across the groove before returning.',
        'I plant the rear foot before changing direction.',
        'I keep the returning strike close to my body.',
      ],
      [
        'I keep the low strike a handspan from the ledge.',
        'I move my leading foot along the clear floor.',
        'I hold my free hand high while driving the low line.',
      ],
      [
        'I settle into the old mark before changing direction.',
        'I keep my shoulders steady until the sideways push.',
        'I push sideways from a bent supporting knee.',
      ],
    ],
  },
  'storm-1': {
    attack: [
      [
        'I keep the banner between my near hand and their view.',
        'I move when the loose fabric swings outward.',
        'I take short steps along the fabric edge.',
      ],
      [
        'I keep my leading shoulder close to the pillar.',
        'I show a hand on one side before cutting around the other.',
        'I plant both feet before the final turn.',
      ],
      [
        'I splash with my toe while keeping weight on my rear foot.',
        'I make the lunge shorter than the first visible step.',
        'I begin the hand movement only after the water rises.',
      ],
    ],
    defense: [
      [
        'I grip the loose edge and draw it sideways.',
        'I keep the cloth away from my own feet.',
        'I take one backward step as the fabric crosses between us.',
      ],
      [
        'I turn through small steps close to the pillar base.',
        'I keep my outer hand high during the pivot.',
        'I pause at the far edge before taking the next step.',
      ],
      [
        'I keep the reflection below the edge of my raised guard.',
        'I compare reflected movement with the position of their feet.',
        'I avoid moving my head until the water settles briefly.',
      ],
    ],
    finisher: [
      [
        'I keep the thrust close until my shoulder clears the cloth.',
        'I step beyond the fabric before extending my arm.',
        'I time my step with an outward movement of the banner.',
      ],
      [
        'I show my shoulder at one edge before reversing.',
        'I keep the return path tight to the pillar.',
        'I plant my back foot before pushing toward the other side.',
      ],
      [
        'I bend my supporting knee before beginning the sweep.',
        'I keep my planted foot clear of the water.',
        'I make the sweep a short arc rather than a full turn.',
      ],
    ],
  },
  'storm-2': {
    attack: [
      [
        'I place my whole leading foot on the step.',
        'I keep my hips low while raising my forward hand.',
        'I pause on the step before extending into range.',
      ],
      [
        'I stay near the visible edge of the stairway.',
        'I keep my feet close enough for a short stop.',
        'I change my shoulder angle while the mist passes.',
      ],
      [
        'I keep most of my weight on the stationary foot.',
        'I stop the feint before fully extending my hand.',
        'I angle the sliding foot slightly away from the direct line.',
      ],
    ],
    defense: [
      [
        'I feel the stair edge with my heel before shifting weight.',
        'I keep my guard facing down the stairway.',
        'I take one step at a time with bent knees.',
      ],
      [
        'I watch the nearest clear edge of the mist.',
        'I keep my weight centred and both hands ready.',
        'I listen for footsteps while holding my ground.',
      ],
      [
        'I keep both feet beneath my shoulders.',
        'I bend my knees before meeting forward pressure.',
        'I turn with small foot adjustments rather than a long slide.',
      ],
    ],
    finisher: [
      [
        'I plant the lower foot before extending the strike.',
        'I keep my rear hand high while stepping down.',
        'I turn my hips through the diagonal after landing.',
      ],
      [
        'I keep the first movement above my guard line.',
        'I settle my weight before bringing the return strike low.',
        'I bring the low return close to my leading knee.',
      ],
      [
        'I shorten the slide before shifting weight forward.',
        'I plant the rear foot before extending my arm.',
        'I keep the thrust close to my centre line.',
      ],
    ],
  },
  'storm-3': {
    attack: [
      [
        'I keep the broken stone beside my near shoulder.',
        'I follow the clear floor with short diagonal steps.',
        'I pause beside a gap before committing to the next step.',
      ],
      [
        'I brush the cloth aside with the back of my hand.',
        'I keep the loose fabric outside my leading foot.',
        'I step only after the cloth has cleared my view.',
      ],
      [
        'I set my feet before waiting for the next flash.',
        'I keep my hand close until the light arrives.',
        'I lunge diagonally as the terrace brightens.',
      ],
    ],
    defense: [
      [
        'I turn my shoulders narrow before passing the gap.',
        'I lead with the foot nearest the clear opening.',
        'I keep my guard toward them while moving backward.',
      ],
      [
        'I move as the cloth swings toward the space between us.',
        'I keep the fabric clear of my knees.',
        'I sidestep close to the cloth edge without turning away.',
      ],
      [
        'I compare their feet across successive flashes.',
        'I watch their hips before following their hands.',
        'I hold my head steady until the next burst of light.',
      ],
    ],
    finisher: [
      [
        'I plant my rear foot at the edge of the gap.',
        'I keep my strike tucked close while changing direction.',
        'I turn my shoulders before stepping back through the opening.',
      ],
      [
        'I show the first movement above the cloth edge.',
        'I keep my supporting foot clear of the loose fabric.',
        'I make the sweep from a low stance beside the cloth.',
      ],
      [
        'I keep my weight on the rear foot during the feint.',
        'I let my raised hand stay still as the light dims.',
        'I shift my hips only when the bright outline fades.',
      ],
    ],
  },
  'verdant-1': {
    attack: [
      [
        'I place my lead foot in the clear space between roots.',
        'I keep the lunge short enough to recover my footing.',
        'I bring my hand forward only after planting beyond the root.',
      ],
      [
        'I leave a full step between myself and the railing.',
        'I keep my lead shoulder toward the open garden.',
        'I change pace as I approach the nearest corner.',
      ],
      [
        'I keep my striking hand on the shaded side.',
        'I move between light patches with short diagonal steps.',
        'I pause in one patch before crossing the next boundary.',
      ],
    ],
    defense: [
      [
        'I place my rear foot against the root without stepping over it.',
        'I bend my knees while keeping my guard above the root.',
        'I turn my shoulder inward to stay close to the wood.',
      ],
      [
        'I keep my near elbow clear of the railing.',
        'I move the leading foot first without crossing my legs.',
        'I pause before the corner to check the clear floor.',
      ],
      [
        'I keep their shoulders outlined against the bright patch.',
        'I hold my guard below my line of sight.',
        'I make small side steps to preserve the light behind them.',
      ],
    ],
    finisher: [
      [
        'I keep the low feint above the root rather than catching it.',
        'I plant the leading foot before extending the thrust.',
        'I leave a short pause between the low feint and the thrust.',
      ],
      [
        'I plant my outer foot before reversing around the corner.',
        'I turn my hips first while keeping the guard close.',
        'I shorten my steps beside the railing before changing pace.',
      ],
      [
        'I lower my shoulders before leaving the bright patch.',
        'I push off from a planted foot at the light boundary.',
        'I angle the rush toward the darker open floor.',
      ],
    ],
  },
  'verdant-2': {
    attack: [
      [
        'I keep my forward shoulder close to the column end.',
        'I step beyond the stone before extending the strike.',
        'I show my hand above the column before moving around it.',
      ],
      [
        'I draw the vine sideways from a firm grip.',
        'I keep its length clear of my leading foot.',
        'I begin with a short pull before advancing behind it.',
      ],
      [
        'I keep both feet aligned with the clear strip.',
        'I shorten the lunge to leave room for recovery.',
        'I extend my hand only after planting the front foot.',
      ],
    ],
    defense: [
      [
        'I keep my guard above the line of the column.',
        'I step sideways along the stone without turning my back.',
        'I pause near the end before choosing a new angle.',
      ],
      [
        'I step where the vines hang farthest apart.',
        'I keep the nearest vine outside my raised guard.',
        'I move one foot back before shifting the rest of my weight.',
      ],
      [
        'I feel for clear stone with the rear heel.',
        'I keep my steps short and my knees bent.',
        'I hold my guard steady while moving along the strip.',
      ],
    ],
    finisher: [
      [
        'I show a hand over the stone before lowering my stance.',
        'I plant my leading foot beside the end before rushing.',
        'I keep the turn close to the column with my guard tucked in.',
      ],
      [
        'I push the nearest vine outward with my forearm.',
        'I move my leading foot through the cleared space first.',
        'I keep my striking hand close until my shoulder clears.',
      ],
      [
        'I plant the rear foot before reversing my movement.',
        'I lower my stance before pushing down the path.',
        'I keep my hand on the centre line as I step forward.',
      ],
    ],
  },
  'verdant-3': {
    attack: [
      [
        'I keep both feet on clear stone beside the moss.',
        'I show my shoulder toward the edge before closing distance.',
        'I shorten the final step to stay balanced near the boundary.',
      ],
      [
        'I keep the strike close to the upright without touching it.',
        'I step past the frame before extending my arm.',
        'I keep my free hand high on the open side.',
      ],
      [
        'I brush the leaves with the outside of my boot.',
        'I keep my weight on the foot that stays still.',
        'I move my hand after the leaves begin to slide.',
      ],
    ],
    defense: [
      [
        'I step onto clear stone before turning my hips.',
        'I keep my leading foot light enough to change angle.',
        'I use several small steps rather than one wide pivot.',
      ],
      [
        'I keep the upright beside my near shoulder.',
        'I turn my feet before bringing my hips around.',
        'I keep my outer hand high while passing the frame.',
      ],
      [
        'I watch fresh leaf movement nearest their leading foot.',
        'I compare disturbed leaves with the direction of the drift.',
        'I keep my head still and scan the ground ahead.',
      ],
    ],
    finisher: [
      [
        'I show my hand toward the moss while keeping my feet clear.',
        'I plant my rear foot on bare stone before pushing inward.',
        'I make the inward drive shorter than the first feint.',
      ],
      [
        'I keep the reverse turn tight to the upright.',
        'I plant my feet before extending through the frame.',
        'I turn my shoulders first with the striking hand held close.',
      ],
      [
        'I keep the leaf sweep close to my leading foot.',
        'I settle my weight before raising the strike.',
        'I keep my free hand high during the low movement.',
      ],
    ],
  },
  'neon-1': {
    attack: [
      [
        'I flick the cable sideways with a short wrist movement.',
        'I keep the loose length beyond my leading foot.',
        'I delay my step until the cable begins to fall.',
      ],
      [
        'I keep the support beside my forward shoulder.',
        'I plant my outer foot before changing angle.',
        'I show my hand outside the support before moving inside.',
      ],
      [
        'I splash with my toe while keeping weight on dry ground.',
        'I move my striking hand only after the water rises.',
        'I follow the splash with a short diagonal step.',
      ],
    ],
    defense: [
      [
        'I grip the cable low and draw it sideways.',
        'I keep the cable clear of my own retreating foot.',
        'I step back as the slack starts to straighten.',
      ],
      [
        'I keep my turn close to the support base.',
        'I hold my outer hand high during the pivot.',
        'I take two short steps instead of one wide turn.',
      ],
      [
        'I place each foot before shifting my weight.',
        'I keep my knees bent and my guard close.',
        'I move diagonally toward the nearest dry patch.',
      ],
    ],
    finisher: [
      [
        'I pull from beside the wet patch with both feet planted.',
        'I take up the slack gradually before the final pull.',
        'I keep my hands low while drawing the cable sideways.',
      ],
      [
        'I show my shoulder around one side before reversing.',
        'I plant my rear foot before the inward step.',
        'I keep the thrust close until clearing the support.',
      ],
      [
        'I keep my supporting knee bent above the dry floor.',
        'I trace a short sweeping arc across the wet edge.',
        'I hold my free hand high while turning my hips inward.',
      ],
    ],
  },
  'neon-2': {
    attack: [
      [
        'I move the reflected hand before shifting my feet.',
        'I keep my real shoulder narrow beside the panel.',
        'I pause after the mirrored motion before changing angle.',
      ],
      [
        'I keep my leading foot aligned with the opening.',
        'I extend the thrust only after setting my rear foot.',
        'I keep my free hand high beside the narrow lane.',
      ],
      [
        'I keep my striking hand on the darker side.',
        'I change pace as a shadow reaches my shoulder.',
        'I take a short diagonal step between the light patches.',
      ],
    ],
    defense: [
      [
        'I compare the reflection with the position of their feet.',
        'I keep the panel in the edge of my vision.',
        'I hold my head steady while tracking their reflected shoulder.',
      ],
      [
        'I lower my stance until the barrier covers my midsection.',
        'I move backward at an angle toward its nearest end.',
        'I keep my guard above the edge while settling behind it.',
      ],
      [
        'I focus on their shoulders rather than the floor.',
        'I keep my feet planted through the next light change.',
        'I hold my hands close to reduce unnecessary movement.',
      ],
    ],
    finisher: [
      [
        'I keep the first motion broad and the thrust narrow.',
        'I plant the front foot before changing from feint to thrust.',
        'I keep my real hand close until the reflected feint ends.',
      ],
      [
        'I show my hand in the gap before circling the end.',
        'I keep the sweep close to the barrier edge.',
        'I plant my outside foot before turning into the strike.',
      ],
      [
        'I settle my weight on the rear foot during the pause.',
        'I keep my outline narrow before the forward step.',
        'I push diagonally out of the shadow with a short stride.',
      ],
    ],
  },
  'neon-3': {
    attack: [
      [
        'I plant the outer foot where two lines meet.',
        'I keep my shoulders steady until the diagonal step.',
        'I cross the first line slowly before changing pace.',
      ],
      [
        'I place my leading foot on the lower floor before extending.',
        'I bend my rear knee to control the change in height.',
        'I keep my guard close while stepping off the edge.',
      ],
      [
        'I keep my striking hand on the shaded side.',
        'I take short steps across each light boundary.',
        'I pause at a bright edge before changing the strike angle.',
      ],
    ],
    defense: [
      [
        'I keep my lead foot close to the painted crossing.',
        'I turn in small steps around the same marked point.',
        'I keep my guard facing them throughout the pivot.',
      ],
      [
        'I feel the step with my rear heel without lifting it.',
        'I keep my knees bent and my weight centred.',
        'I turn through my hips while maintaining contact with the edge.',
      ],
      [
        'I move backward diagonally toward the darker boundary.',
        'I stop with one foot inside the pool of light.',
        'I keep my shoulders turned toward their visible outline.',
      ],
    ],
    finisher: [
      [
        'I match the first step to my earlier pace.',
        'I plant my outside foot before changing direction.',
        'I keep my hand still until the diagonal step begins.',
      ],
      [
        'I show a downward shoulder movement before driving inward.',
        'I keep my feet on the same level during the feint.',
        'I plant the rear foot before the change of direction.',
      ],
      [
        'I keep the thrust close until leaving the dark patch.',
        'I plant my leading foot before extending into the light.',
        'I keep my outline narrow through the first advancing step.',
      ],
    ],
  },
};
