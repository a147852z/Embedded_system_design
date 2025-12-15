from django.db import models


class ParkingSpot(models.Model):
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('OCCUPIED', 'Occupied'),
        ('ABNORMAL', 'Abnormal'),
    ]

    id = models.CharField(max_length=32, primary_key=True)
    label = models.CharField(max_length=32)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='AVAILABLE')
    # is_ev and is_priority removed — not tracked in newer schema
    distance_raw = models.IntegerField(default=0)
    floor = models.IntegerField(default=1)
    section = models.CharField(max_length=8, default='A')
    plate_number = models.CharField(max_length=32, null=True, blank=True)
    parked_time = models.DateTimeField(null=True, blank=True)
    abnormal_reason = models.TextField(null=True, blank=True)

    def __str__(self):
        return self.label


class LogEntry(models.Model):
    timestamp = models.DateTimeField()
    type = models.CharField(max_length=32)
    message = models.TextField()
    spot = models.ForeignKey(ParkingSpot, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"[{self.timestamp}] {self.type} - {self.message[:40]}"
