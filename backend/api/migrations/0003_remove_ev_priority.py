from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_create_initial_spots'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='parkingspot',
            name='is_ev',
        ),
        migrations.RemoveField(
            model_name='parkingspot',
            name='is_priority',
        ),
    ]
