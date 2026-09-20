from basilisk_v3.device import BasiliskV3Device


class NagaV2HyperSpeedDevice(BasiliskV3Device):
    """
    Razer Naga V2 HyperSpeed, 2.4 GHz receiver (1532:00B4).

    Same 90-byte feature-report protocol as the Basilisk V3 (transaction id 0x1F),
    but the control interface is USB interface 0: the Mouse collection that carries
    the vendor (0xFF00) feature report. Interfaces 1 and 2 are plain keyboards with
    no feature report, which is how we tell them apart under WebHID (which does not
    expose interface numbers).

    Button IDs come from the device's own remappable-button table
    (class 0x02 / id 0x84):  01 02 03 34 35 0b 0c | 40..4b | 09 0a

    Verified on hardware by reading every id back with class 0x02 / id 0x8C
    on profiles 0x00 and 0x01. Factory bindings:
      0x01-0x03 left/right/middle, 0x34/0x35 wheel tilt (mouse 4/5),
      0x0b/0x0c DPI up/down, 0x09/0x0a wheel up/down,
      0x40..0x4B thumb 1..12 = keyboard 1..9, (see below), '-', '='.
    thumb_10 (0x49) ships bound to a left-click mouse-turbo (200 ms), not
    to keyboard '0'. That is why, out of the box, it behaves as a plain
    left click on the host. Rebind it here to change that.
    """

    vid = 0x1532
    pid = 0x00B4
    ifn = 0
    model_name = 'Razer Naga V2 HyperSpeed'
    buttons_layout = [
        'left', 'middle', 'right', 'wheel_up',
        'wheel_left', 'wheel_right', 'dpi_up', 'wheel_down',
        'thumb_1', 'thumb_2', 'thumb_3', 'dpi_down',
        'thumb_4', 'thumb_5', 'thumb_6', None,
        'thumb_7', 'thumb_8', 'thumb_9', None,
        'thumb_10', 'thumb_11', 'thumb_12', None,
    ]

    def _fix_interface_number(self, it):
        fio = tuple(it.get('fio_count') or ())
        if (it.get('vendor_id') == self.vid and it.get('product_id') == self.pid
                and it.get('interface_number', -1) == -1
                and len(fio) >= 1 and fio[0] > 0):
            it['interface_number'] = self.ifn
        return it
