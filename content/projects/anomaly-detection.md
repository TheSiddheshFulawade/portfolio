---
id: anomaly-detection
published: true
featured: false
earlier: true
order: 20
updated: 2026-11-24
title: Real-time anomaly detection
tagline: A video model that spots 7 kinds of anomalies in a live feed and raises an alarm.
status: Completed 2024
stack: [Python, TensorFlow, LRCN, Django, Twilio]
---

Final-year project, registered for copyright with the Government of India.

- Trained a hybrid LRCN model (convolutional layers plus LSTM) that recognises 7 distinct anomalies in real-time video.
- Reached 79% accuracy on the selected UCF-Crime dataset.
- Triggers an alarm and places a voice call through Twilio, depending on the severity of the anomaly.
