import { GAME_CONFIG } from "../game/config";
import type { ClearClassification, PuzzleDefinition } from "./types";

export function calculateReward(puzzle: PuzzleDefinition, classification: ClearClassification, multiplier: number = GAME_CONFIG.clearMultipliers[classification]): number {
  const cellReward = puzzle.usableCellIndices.length * GAME_CONFIG.reward.cellRewardMultiplier;
  const difficultyReward = Math.floor(GAME_CONFIG.reward.difficultyRewardMultiplier * puzzle.difficulty.score);
  const tierMultiplier = Math.min(
    GAME_CONFIG.reward.tierRewardMaxMultiplier,
    GAME_CONFIG.reward.tierRewardBaseMultiplier * GAME_CONFIG.reward.tierRewardGrowthFactor ** puzzle.tier,
  );
  const baseReward = Math.max(1, Math.floor((cellReward + difficultyReward) * tierMultiplier));
  return Math.min(GAME_CONFIG.currency.maxSafeAmount, Math.floor(baseReward * multiplier));
}
