---
title: "Occupancy Estimation using Structural Vibrations"
description: "A Privacy-Preserving, Deep Learning Approach to Occupancy Detection"
date: "November 2025"
# Repo is private on GitHub (404 for visitors); restore this line if it is made public again.
# repoURL: "https://github.com/logxdx/Occupancy-Estimation-using-Structural-Vibrations"
# demoURL: ""
category: "Applied ML · Signals"
areas: [applied-ml]
tags: ["Signal processing", "Deep learning", "Edge inference"]
featured: false
---

This project monitors occupancy in sensitive places where cameras or microphones are not acceptable for privacy reasons. Low-cost geophones sense structural vibrations, and the system detects and classifies human and animal presence from their gait and footstep signatures.

Vibration sensing keeps working in darkness, when the view is blocked and in bad weather. The goal is a lightweight multi-class detector that tells human, animal and noise signals apart and runs on embedded hardware such as microcontrollers or single-board computers.

## Signal processing

A geophone records the raw signal at 8 kHz. For event detection the signal is downsampled to 500 Hz, 16x fewer samples, and filtered into three frequency bands: 10–60 Hz, 60–120 Hz and 120–180 Hz. A Hilbert envelope is taken for each band.

The three envelopes are averaged into one detection signal. Footstep events are found with peak detection and parabolic interpolation.

Each peak is then checked with a continuous wavelet transform (CWT) using a Morlet wavelet. A peak counts as a footstep only if its CWT ridge magnitude is above the 70th percentile, which filters out low-energy noise events.

## Synthetic multi-occupancy data

Data is scarce, and the hardest case is several people walking at the same time (multi-occupancy). A synthetic data pipeline covers both problems in three steps:

1. Random users and their processed footstep events are selected, and random slices are cut from the full audio files.
2. The time series of the overlapping segments are summed (superposition), with a distance gain to simulate different distances from the sensor.
3. Gaussian noise, scaled from the computed signal power, is added to the mix.

Each result is a mixed sample with overlapping footsteps from several sources, for training the model on multi-source signals.

## Models

The final models take the raw 1D vibration waveform: a 2.5-second window at 8 kHz, which is 20,000 samples. The raw waveform keeps the fine timing of the heel strike, toe-off and surface resonance, which is lost when the signal is turned into a time-frequency image.

The baseline, Footstep1DNet, is a small 1D CNN built for fast inference on microcontrollers. It has four convolutional blocks with shrinking kernel sizes ($25 \rightarrow 15 \rightarrow 9 \rightarrow 5$). It is fast, but this shallow design has a high false negative rate, especially for users with light or subtle gaits, which limits its use in real deployments.

The proposed model, FootstepResNet, is a deeper network built from residual blocks. Its first layer is a Conv1D with a kernel of size 129, which covers about 16 ms of the 8 kHz input. That window is sized to the physics of a footstep: the first high-energy impact, the coupling of foot and surface, and the resonant decay.

Three stacked residual blocks with skip connections follow. They keep deep training stable, prevent vanishing gradients and let the model learn the longer gait patterns that separate users with similar signatures.

## Results

FootstepResNet missed fewer footsteps and raised fewer false alarms than the baseline.

| Metric | Baseline (Footstep1DNet) | Proposed (FootstepResNet) | Change |
| :-- | :-- | :-- | :-- |
| False negatives (FN) | 723 | 183 | 3.95x fewer (about 4x) |
| False positives (FP) | 331 | 170 | 1.95x fewer (about 2x) |
| Accuracy | Varied across users | 96–99% across users | Higher |

It also recovered the "problematic" users that the baseline kept missing. For those users, false negatives dropped from 331 to 2, about 165x fewer.

## Limitations and future work

The classifier is closed-set. It is trained on a fixed set of identities and forces any unknown intruder into one of them, which can lead to silent failures. Future work targets open-set recognition, so the system can detect people it has never seen.

For deployment, FootstepResNet is to be optimized for the edge with post-training INT8 quantization, pruning and TFLite runtime optimization for microcontrollers and single-board computers.

The system does multi-label detection but does not yet separate the sources. Moving from detection to explicit source separation would allow accurate counting and tracking when many footsteps overlap.

Generalization will also be tested on other surfaces, such as wood, concrete, tile, and soil or outdoor ground, to handle domain shift.
