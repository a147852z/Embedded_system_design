from django.db import migrations


def create_initial_spots(apps, schema_editor):
    ParkingSpot = apps.get_model('api', 'ParkingSpot')
    spots = [
        {'id': 'A-1', 'label': 'A-1', 'status': 'AVAILABLE', 'is_ev': True, 'is_priority': False, 'distance_raw': 5, 'floor': 1, 'section': 'A'},
        {'id': 'A-2', 'label': 'A-2', 'status': 'OCCUPIED', 'is_ev': False, 'is_priority': False, 'distance_raw': 8, 'floor': 1, 'section': 'A', 'plate_number': 'ABC-5678'},
        {'id': 'A-3', 'label': 'A-3', 'status': 'AVAILABLE', 'is_ev': False, 'is_priority': False, 'distance_raw': 7, 'floor': 1, 'section': 'A'},
        {'id': 'A-4', 'label': 'A-4', 'status': 'ABNORMAL', 'is_ev': False, 'is_priority': True, 'distance_raw': 10, 'floor': 1, 'section': 'A', 'abnormal_reason': '模擬異常'},
    ]

    for s in spots:
        ParkingSpot.objects.update_or_create(id=s['id'], defaults=s)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_initial_spots, reverse_code=migrations.RunPython.noop),
    ]
