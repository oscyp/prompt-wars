// Glicko-2 rating system implementation
// Chosen for async play and sparse activity (rating deviation grows during inactivity)

const TAU = 0.5; // System volatility constraint (lower = more stable)
const EPSILON = 0.000001; // Convergence threshold

/**
 * Convert Glicko-2 rating to Glicko scale (for display)
 */
export function toGlickoScale(rating: number): number {
  return rating * 173.7178 + 1500;
}

/**
 * Convert Glicko scale to Glicko-2 (for computation)
 */
export function toGlicko2Scale(rating: number): number {
  return (rating - 1500) / 173.7178;
}

/**
 * Convert rating deviation to Glicko-2 scale
 */
export function rdToGlicko2(rd: number): number {
  return rd / 173.7178;
}

/**
 * Convert rating deviation from Glicko-2 scale
 */
export function rdFromGlicko2(phi: number): number {
  return phi * 173.7178;
}

/**
 * Glicko-2 g function
 */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * Expected score E
 */
function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Calculate new volatility (iterative convergence)
 */
function updateVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number
): number {
  const a = Math.log(sigma * sigma);
  const tau = TAU;
  
  // Initial values
  let A = a;
  let B: number;
  
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k++;
    }
    B = a - k * tau;
  }
  
  function f(x: number): number {
    const ex = Math.exp(x);
    const num1 = ex * (delta * delta - phi * phi - v - ex);
    const den1 = 2 * ((phi * phi + v + ex) ** 2);
    const num2 = x - a;
    const den2 = tau * tau;
    return num1 / den1 - num2 / den2;
  }
  
  // Iterative convergence
  let fA = f(A);
  let fB = f(B);
  
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    
    B = C;
    fB = fC;
  }
  
  return Math.exp(A / 2);
}

/**
 * Update Glicko-2 ratings after a single match
 */
export function updateGlicko2(
  playerRating: number,
  playerRd: number,
  playerVol: number,
  opponentRating: number,
  opponentRd: number,
  score: number // 1 = win, 0.5 = draw, 0 = loss
): { rating: number; rd: number; vol: number; delta: number } {
  // Convert to Glicko-2 scale
  const mu = toGlicko2Scale(playerRating);
  const phi = rdToGlicko2(playerRd);
  const sigma = playerVol;
  const muJ = toGlicko2Scale(opponentRating);
  const phiJ = rdToGlicko2(opponentRd);
  
  // Step 3: Compute v (estimated variance)
  const gPhiJ = g(phiJ);
  const expectedScore = E(mu, muJ, phiJ);
  const v = 1 / (gPhiJ * gPhiJ * expectedScore * (1 - expectedScore));
  
  // Step 4: Compute delta (improvement in rating)
  const delta = v * gPhiJ * (score - expectedScore);
  
  // Step 5: Update volatility
  const sigmaPrime = updateVolatility(sigma, phi, v, delta);
  
  // Step 6: Update rating deviation
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  
  // Step 7: Update rating
  const muPrime = mu + phiPrime * phiPrime * gPhiJ * (score - expectedScore);
  
  // Convert back to Glicko scale
  return {
    rating: toGlickoScale(muPrime),
    rd: rdFromGlicko2(phiPrime),
    vol: sigmaPrime,
    delta: toGlickoScale(muPrime) - playerRating,
  };
}

/**
 * Compute rating changes for both players after a battle
 */
export interface RatingUpdate {
  delta: number;
  rd: number;
  vol: number;
}

export function computeRatingDeltas(
  playerOneRating: number,
  playerOneRd: number,
  playerOneVol: number,
  playerTwoRating: number,
  playerTwoRd: number,
  playerTwoVol: number,
  playerOneWon: boolean,
  isDraw: boolean
): { playerOne: RatingUpdate; playerTwo: RatingUpdate } {
  const p1Score = isDraw ? 0.5 : playerOneWon ? 1 : 0;
  const p2Score = isDraw ? 0.5 : playerOneWon ? 0 : 1;
  
  const p1Update = updateGlicko2(
    playerOneRating,
    playerOneRd,
    playerOneVol,
    playerTwoRating,
    playerTwoRd,
    p1Score
  );
  
  const p2Update = updateGlicko2(
    playerTwoRating,
    playerTwoRd,
    playerTwoVol,
    playerOneRating,
    playerOneRd,
    p2Score
  );
  
  return {
    playerOne: {
      delta: p1Update.delta,
      rd: p1Update.rd,
      vol: p1Update.vol,
    },
    playerTwo: {
      delta: p2Update.delta,
      rd: p2Update.rd,
      vol: p2Update.vol,
    },
  };
}
