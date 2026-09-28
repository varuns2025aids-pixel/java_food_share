package com.example.java_practical.repository;

import com.example.java_practical.entity.food_entity.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface food_repository {

    interface DonorRepo extends JpaRepository<Donor, Long> {}

    interface NgoRepo extends JpaRepository<NGO, Long> {}

    interface ListingRepo extends JpaRepository<FoodListing, Long> {

        Page<FoodListing> findAll(Pageable p);

        // pessimistic lock so two NGOs cannot claim the same listing concurrently
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("select f from FoodListing f where f.id = :id")
        Optional<FoodListing> findForUpdate(@Param("id") Long id);

        // find unclaimed listings that have passed their safe-to-eat-until time
        List<FoodListing> findByStatusAndSafeUntilBefore(ListingStatus status, LocalDateTime now);

        // sum of kg diverted from waste in a monthly window
        @Query("select sum(f.quantity) from FoodListing f " +
                "where f.status = :status and f.collectedAt >= :start and f.collectedAt < :end")
        Double totalCollected(@Param("status") ListingStatus status,
                              @Param("start") LocalDateTime start,
                              @Param("end") LocalDateTime end);

        // listings collected in a monthly window for detailed report
        @Query("select f from FoodListing f where f.status = :status and f.collectedAt >= :start and f.collectedAt < :end order by f.collectedAt desc")
        List<FoodListing> findCollectedBetween(@Param("status") ListingStatus status,
                                               @Param("start") LocalDateTime start,
                                               @Param("end") LocalDateTime end);
    }

    interface ClaimRepo extends JpaRepository<Claim, Long> {
        Optional<Claim> findByListingAndStatus(FoodListing l, ClaimStatus s);
        Optional<Claim> findTopByListingOrderByClaimedAtDesc(FoodListing l);
        void deleteByListing(FoodListing l);
    }
}
