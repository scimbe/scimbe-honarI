/**
 * Embedded Temporal Activities - Real mathematical calculations
 * These activities are automatically deployed by the Workflow Automation Service
 */

import { log } from '@temporalio/activity';

/**
 * Real activity: Validates that radius is a positive number
 */
export async function validateRadiusActivity(radius: number): Promise<{ 
  valid: boolean; 
  radius: number; 
  error?: string 
}> {
  log.info(`🔍 [EMBEDDED ACTIVITY] Validating radius: ${radius}`);
  
  if (typeof radius !== 'number' || isNaN(radius)) {
    const result = { valid: false, radius, error: 'Radius must be a valid number' };
    log.warn(`❌ [EMBEDDED] Validation failed: ${result.error}`);
    return result;
  }
  
  if (radius <= 0) {
    const result = { valid: false, radius, error: 'Radius must be positive' };
    log.warn(`❌ [EMBEDDED] Validation failed: ${result.error}`);
    return result;
  }
  
  const result = { valid: true, radius };
  log.info(`✅ [EMBEDDED] Radius validation passed: ${radius}`);
  return result;
}

/**
 * Real activity: Calculates circle area using π × r²
 */
export async function calculateCircleAreaActivity(radius: number): Promise<{
  radius: number;
  area: number;
  area_exact: number;
  formula: string;
  pi_value: number;
  calculation: string;
}> {
  log.info(`🧮 [EMBEDDED ACTIVITY] Calculating circle area for radius: ${radius}`);
  
  // THE REAL MATHEMATICAL CALCULATION using JavaScript's Math.PI
  const area_exact = Math.PI * radius * radius;
  const area = Math.round(area_exact * 1000000) / 1000000; // 6 decimal places
  
  const result = {
    radius,
    area,
    area_exact,
    formula: 'π × r²',
    pi_value: Math.PI,
    calculation: `${Math.PI} × ${radius}² = ${area_exact}`
  };
  
  log.info(`🎯 [EMBEDDED] AREA CALCULATED: ${area} (exact: ${area_exact})`);
  return result;
}

/**
 * Real activity: Formats calculation result for output
 */
export async function formatResultActivity(calculationData: {
  radius: number;
  area: number;
  area_exact: number;
  formula: string;
  pi_value: number;
  calculation: string;
}): Promise<{
  success: boolean;
  input: { radius: number };
  output: { area: number };
  message: string;
  calculation_details: any;
  workflow_id: string;
  generated_by: string;
}> {
  log.info(`📋 [EMBEDDED ACTIVITY] Formatting calculation result...`);
  
  const result = {
    success: true,
    input: { radius: calculationData.radius },
    output: { area: calculationData.area },
    message: `Circle with radius ${calculationData.radius} has area ${calculationData.area} square units`,
    calculation_details: {
      formula: calculationData.formula,
      pi_value: calculationData.pi_value,
      calculation: calculationData.calculation,
      raw_area: calculationData.area_exact,
      formatted_area: calculationData.area
    },
    workflow_id: 'embedded-circle-workflow',
    generated_by: 'EMBEDDED Temporal Worker'
  };
  
  log.info(`📊 [EMBEDDED] FORMATTED: ${result.message}`);
  return result;
}