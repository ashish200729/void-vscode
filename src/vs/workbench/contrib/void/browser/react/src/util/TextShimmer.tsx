/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo, type JSX } from 'react';
import { motion } from 'framer-motion';

interface TextShimmerProps {
	children: string;
	as?: React.ElementType;
	className?: string;
	duration?: number;
	spread?: number;
}

export function TextShimmer({
    children,
    as: Component = 'span',
    className = '',
    duration = 1.5,
    spread = 2,
}: TextShimmerProps) {
	const MotionComponent = motion(Component as keyof JSX.IntrinsicElements);

    const dynamicSpread = useMemo(() => {
        // Slightly widen the highlight band (~+25%) for legibility
        return children.length * spread * 1.25;
    }, [children, spread]);

	return (
		<MotionComponent
			className={className}
			initial={{ backgroundPosition: '100% center' }}
			animate={{ backgroundPosition: '0% center' }}
			transition={{
				repeat: Infinity,
				duration,
				ease: 'linear',
			}}
            style={{
                display: 'inline-block',
                backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) calc(50% - ${dynamicSpread}px), rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) calc(50% + ${dynamicSpread}px), rgba(255,255,255,0) 100%)`,
                backgroundSize: '250% 100%',
                backgroundRepeat: 'no-repeat',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                willChange: 'background-position',
            } as React.CSSProperties}
		>
			{children}
		</MotionComponent>
	);
}
