import { GAME_CONFIG } from "../game/config";
import type { ClearClassification, PuzzleDefinition } from "./types";

export function calculateReward(puzzle: PuzzleDefinition, classification: ClearClassification): number {
  const cellReward = puzzle.usableCellIndices.length * GAME_CONFIG.reward.cellRewardMultiplier;
  const difficultyReward = Math.floor(GAME_CONFIG.reward.difficultySqrtMultiplier * Math.sqrt(puzzle.difficulty.score));
  const baseReward = Math.max(1, cellReward + difficultyReward);
  const multiplier = GAME_CONFIG.clearMultipliers[classification];
  return Math.min(GAME_CONFIG.currency.maxSafeAmount, Math.floor(baseReward * multiplier));
}
