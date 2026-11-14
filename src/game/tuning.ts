/**
 * Every number that decides how the game feels, in one place. Units are meters, seconds, m/s.
 *
 * The idea: the turkey is heavy. Whoever holds it is slower, turns wider and tires the longer they
 * hold on, so the chasers always close in. To keep it, the holder dodges (a sideways burst), dips
 * (ducks under a grab) or throws (hold to wind up, release to let fly).
 */
export const T = {
  /** A round, and the countdown before it. */
  roundSeconds: 5 * 60,
  countdownSeconds: 3,

  // --- running
  /** Top speed without the turkey. */
  runSpeed: 6.6,
  /** Top speed with it, fresh... */
  holdSpeed: 6.0,
  /** ...and what it falls to after holding it this long (the arms tire). */
  holdSpeedTired: 4.7,
  holdTireSeconds: 35,
  /** How hard you can change velocity (m/s²): the turkey's weight makes the holder sluggish. */
  accel: 26,
  holdAccel: 15,
  /** Slowing down with nothing pressed. */
  brake: 20,
  /** Body radius, for bumping into things and each other. */
  bodyRadius: 0.34,

  // --- dodge: a burst in the direction you are pushing (or to the side)
  dodgeSpeed: 11.5,
  holdDodgeSpeed: 10,
  dodgeSeconds: 0.2,
  dodgeCooldown: 1.0,
  holdDodgeCooldown: 1.3,

  // --- dip: duck. Nobody can grab you while you are down, but you crawl.
  dipSeconds: 0.55,
  dipCooldown: 1.5,
  dipSpeedFactor: 0.4,

  // --- grabbing
  /** Touching the holder takes the turkey. */
  touchReach: 0.95,
  /** The grab button lunges you forward and reaches further for a moment. */
  lungeReach: 1.75,
  lungeSeconds: 0.32,
  lungeCooldown: 0.9,
  lungeBoost: 3.5,
  /** Whoever just took the turkey cannot have it taken straight back. */
  stealImmunitySeconds: 1.1,
  /** Reaching a turkey on the floor or the table. */
  pickupReach: 1.25,

  // --- throwing: hold to wind up, release to throw
  windupSeconds: 0.9,
  throwSpeedMin: 6.5,
  throwSpeedMax: 14,
  throwLiftMin: 2.6,
  throwLiftMax: 5.4,
  /** How much of your own running speed the turkey carries. */
  throwCarry: 0.6,
  /** The thrower cannot catch their own throw for this long. */
  throwNoCatchSeconds: 0.5,
  catchReach: 1.05,
  catchHeightMax: 2.3,
  gravity: 9.8,
  /** Turkey air drag (per second), bounce and floor friction. */
  airDrag: 0.06,
  bounce: 0.3,
  floorFriction: 7,
  turkeyRadius: 0.22,

  // --- the dog
  dogName: 'Biscuit',
  dogSpeed: 6.25,
  dogCarrySpeed: 5.4,
  dogAccel: 17,
  dogReach: 0.85,
  /** The dog re-reads where the turkey is this often; between looks it runs at an old position. */
  dogLookSeconds: 0.3,
  /** It drops the turkey after carrying it this long, then sits. */
  dogCarryMax: 7,
  dogRestSeconds: 2.2,
  /** After a person takes the turkey from the dog, the dog is stunned this long. */
  dogStunSeconds: 1.4,
  /** After the dog snatches the turkey, nobody can take it back for this long: it gets a head start. */
  dogSnatchImmunitySeconds: 1.6,
  dogRadius: 0.3,
} as const;

/** How often each phone sends its position, and the host sends the game. */
export const POSE_HZ = 20;
export const SNAP_HZ = 15;
