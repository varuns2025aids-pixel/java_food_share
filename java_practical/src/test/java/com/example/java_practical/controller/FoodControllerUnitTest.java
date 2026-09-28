package com.example.java_practical.controller;

import com.example.java_practical.entity.food_entity.Donor;
import com.example.java_practical.entity.food_entity.NGO;
import com.example.java_practical.service.food_service;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FoodControllerUnitTest {

    @Mock
    private food_service service;

    private food_controller controller;

    @BeforeEach
    void setUp() {
        controller = new food_controller(service);
    }

    @Test
    void testUpdateDonor() {
        Donor donor = new Donor();
        donor.id = 1L;
        donor.name = "Community Kitchen";
        donor.contact = "1234567890";

        when(service.updateDonor(eq(1L), any(Donor.class))).thenReturn(donor);

        Donor result = controller.updateDonor(1L, donor);

        assertEquals("Community Kitchen", result.name);
        assertEquals("1234567890", result.contact);
        verify(service).updateDonor(eq(1L), any(Donor.class));
    }

    @Test
    void testUpdateNgo() {
        NGO ngo = new NGO();
        ngo.id = 2L;
        ngo.name = "Food For All";
        ngo.contact = "0987654321";

        when(service.updateNgo(eq(2L), any(NGO.class))).thenReturn(ngo);

        NGO result = controller.updateNgo(2L, ngo);

        assertEquals("Food For All", result.name);
        assertEquals("0987654321", result.contact);
        verify(service).updateNgo(eq(2L), any(NGO.class));
    }
}
