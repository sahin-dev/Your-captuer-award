import { TeamAccessibility } from '../../../prismaClient';
import { z } from 'zod';

export const createTeamValidationSchema = z.object({
    level: z.string({
        required_error: 'Level is required',
    }),
    language: z.string({
        required_error: 'Language is required',
    }),
    country: z.string({
        required_error: 'Country is required',
    }),
    description: z.string({
        required_error: 'Description is required',
    }),
    accessibility: z.nativeEnum(TeamAccessibility, {
        required_error: 'Accessibility is required',invalid_type_error: 'Accessibility must be PUBLIC or PRIVATE'
    }),
    min_requirement: z.string({required_error:"min requirement is required"})
});

export const updateTeamValidationSchema = z.object({
    level: z.string().optional(),
    language: z.string().optional(),
    country: z.string().optional(),
    description: z.string().optional(),
    accessibility: z.nativeEnum(TeamAccessibility, {
        invalid_type_error: 'Accessibility must be PUBLIC or PRIVATE'
    }).optional(),
});
